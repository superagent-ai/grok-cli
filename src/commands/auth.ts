import { Command } from 'commander';
import open from 'open';
import readline from 'readline';
import puppeteer from 'puppeteer';
import { getSettingsManager } from '../utils/settings-manager.js';

export function createAuthCommand(): Command {
  const authCommand = new Command('auth');
  authCommand.description('Authentication commands for Grok CLI');

  // Login command: Browser to console + key prompt or auto-gen
  authCommand
    .command('login')
    .description('Setup xAI API key - opens console for login & key creation (upgrade required for paid features)')
    .action(async () => {
      try {
        await performConsoleLogin();
        console.log('🎉 Grok CLI ready! Try `grok "hello world"`.');
      } catch (err: any) {
        console.error('💥 Login flow borked:', err.message);
        console.log('Tip: If SSO issues, check your team setup at x.ai/grok/business.');
      }
    });

  // Set management key for auto-gen
  authCommand
    .command('mgmt-key <key>')
    .description('Set management key for auto-generating API keys')
    .action((key: string) => {
      saveMgmtKey(key);
      console.log('✅ Management key saved! Now `grok auth login` can auto-gen API keys.');
    });

  return authCommand;
}

export async function performConsoleLogin(): Promise<void> {
  console.log('🔐 Grok CLI OAuth-Style Setup');
  console.log('============================');
  console.log('Automating login to xAI console for key generation...');
  console.log('1. Browser will launch (headless=false for you to login)');
  console.log('2. Enter your xAI creds when prompted');
  console.log('3. CLI will auto-generate & save your API key');
  console.log('\n💡 Paid plans? Higher quotas await! Upgrade at console.x.ai');

  const browser = await puppeteer.launch({ headless: false, defaultViewport: null }); // Visible for user login
  const page = await browser.newPage();
  
  try {
    // Navigate to console & wait for login
    await page.goto('https://console.x.ai', { waitUntil: 'networkidle0' });
    console.log('⏳ Browser open—login to xAI console now. CLI waiting...');
    
    // Poll for successful login (detect dashboard load) - ADJUST SELECTOR BASED ON REAL UI
    await page.waitForSelector('[data-testid="api-keys-tab"]', { timeout: 300000 }); // 5min timeout for user login
    console.log('✅ Login detected! Generating API key...');
    
    // Click "Create New Key" (adapt selector if UI changes—scrape from console) - PLACEHOLDER
    await page.click('button:has-text("Create API Key")'); // Pseudo-selector; inspect real DOM
    await page.waitForSelector('input[placeholder*="Key Name"]');
    await page.type('input[placeholder*="Key Name"]', 'Grok CLI Key');
    await page.click('button:has-text("Generate")');
    
    // Extract the new key (it flashes or copies to clipboard—handle both) - PLACEHOLDER
    const keyHandle = await page.waitForSelector('.api-key-value'); // Adjust to real class
    const apiKey = await page.evaluate((el: any) => el.textContent, keyHandle);
    
    if (apiKey?.startsWith('xai-')) {
      saveApiKey(apiKey.trim());
      console.log('🎉 Key auto-saved! Ready to rock.');
      
      // Mgmt key fallback if set
      const manager = getSettingsManager();
      const mgmtKey = manager.getUserSetting('mgmtKey');
      if (mgmtKey) {
        console.log('🔧 Mgmt key active—future logins will auto-renew.');
      }
    } else {
      throw new Error('Key extraction failed—check console UI changes');
    }
  } catch (err: any) {
    console.error('❌ Automation hit a snag:', err.message);
    console.log('Falling back to manual...');
    await manualKeyEntry();
  } finally {
    await browser.close();
  }
  
  // Future: If xAI adds OAuth, swap to:
  // await requestDeviceCode(); // Prints code/URL
  // await pollForToken(code);  // Background poll
}

async function manualKeyEntry(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    console.log('🔑 API Key Entry:');
    console.log('- Your API key should start with "xai-"');
    console.log('- Paid plan keys unlock team limits and higher quotas');
    console.log('- Keys are stored securely in ~/.grok/user-settings.json');
    console.log('');
    rl.question('Paste your API key here: ', (key) => {
      if (key && key.trim().startsWith('xai-')) { // Basic validation
        saveApiKey(key.trim());
        console.log('');
        console.log('🎉 Success! Your API key is saved.');
        console.log('💡 Team limits and quotas are now active based on your xAI plan!');
        resolve();
      } else {
        console.log('❌ Invalid key format. Must start with "xai-". Please try again.');
        rl.close();
        reject(new Error('Invalid key'));
      }
      rl.close();
    });
  });
}

function saveApiKey(apiKey: string) {
  const manager = getSettingsManager();
  manager.updateUserSetting('apiKey', apiKey);
  manager.updateUserSetting('baseURL', 'https://api.x.ai/v1');
  console.log('✅ API key saved to settings! (Your team limits apply)');
}

function saveMgmtKey(mgmtKey: string) {
  const manager = getSettingsManager();
  manager.updateUserSetting('mgmtKey', mgmtKey);
}

async function autoGenerateApiKey(mgmtKey: string): Promise<void> {
  const mgmtApiUrl = 'https://management-api.x.ai/v1/api-keys';
  const response = await fetch(mgmtApiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${mgmtKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'CLI Auto-Generated Key',
      acl: ['model:grok-4'] // Adjust as needed
    })
  });

  if (!response.ok) {
    throw new Error(`Management API failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { apiKey: string };
  const { apiKey } = data;
  if (!apiKey) {
    throw new Error('No API key in response');
  }

  saveApiKey(apiKey);
  console.log('✅ API key auto-generated and saved!');
}