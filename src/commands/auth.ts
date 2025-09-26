import { Command } from 'commander';
import open from 'open';
import readline from 'readline';
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

async function performConsoleLogin(): Promise<void> {
  console.log('🔐 Grok CLI Authentication Setup');
  console.log('================================');
  console.log('To use Grok CLI with full features, you need an API key from xAI.');
  console.log('');
  console.log('STEPS:');
  console.log('1. Free users: Upgrade to a paid plan at https://console.x.ai for API access');
  console.log('2. Login to https://console.x.ai');
  console.log('3. Navigate to API Keys section');
  console.log('4. Create a new API key (starts with "xai-...")');
  console.log('5. Copy the key and paste it below');
  console.log('');
  console.log('💡 Pro tip: Paid plans include team limits and higher usage quotas!');
  console.log('');

  // Open xAI console
  const loginUrl = 'https://console.x.ai';
  console.log('🚀 Opening xAI console in your browser...');
  await open(loginUrl).catch(() => console.log('Manual open:', loginUrl));

  console.log('');
  console.log('⏳ After logging in and creating your API key, come back here...');
  console.log('(This window will wait for you)');
  console.log('');

  // Wait for user to complete steps
  await new Promise(resolve => setTimeout(resolve, 10000)); // Give time to read and act

  // Check if management key is set for auto-gen (may not work for free users)
  const manager = getSettingsManager();
  const mgmtKey = manager.getUserSetting('mgmtKey');
  if (mgmtKey) {
    console.log('🔧 Management key detected - attempting automatic API key generation...');
    try {
      await autoGenerateApiKey(mgmtKey);
    } catch (err: any) {
      console.error('❌ Auto-gen failed:', err.message);
      console.log('Falling back to manual key entry...');
      await manualKeyEntry();
    }
  } else {
    console.log('📝 Ready for manual key entry...');
    // Prompt for the key
    await manualKeyEntry();
  }
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