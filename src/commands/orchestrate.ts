import { Command } from 'commander';
import chalk from 'chalk';
import { AccountManager, type LoadBalancingStrategy } from '../orchestration/account-manager.js';
import { SuperAgent, type ExecutionStrategy } from '../orchestration/super-agent.js';
import { OrchestrationDatabase } from '../storage/database.js';
import { PromptLibrary } from '../storage/prompt-library.js';
import { getSettingsManager } from '../utils/settings-manager.js';

/**
 * Get orchestration accounts from environment or settings
 */
function getOrchestrationAccounts(): Array<{ apiKey: string; name: string }> {
  const accounts: Array<{ apiKey: string; name: string }> = [];

  // Try environment variables first
  const account1Key = process.env.GROK_API_KEY;
  const account2Key = process.env.GROK_API_KEY_2;

  if (account1Key) {
    accounts.push({ apiKey: account1Key, name: 'account-1' });
  }

  if (account2Key) {
    accounts.push({ apiKey: account2Key, name: 'account-2' });
  }

  // Fall back to settings manager if no accounts found
  if (accounts.length === 0) {
    const manager = getSettingsManager();
    const apiKey = manager.getApiKey();

    if (apiKey) {
      accounts.push({ apiKey, name: 'account-1' });
    }
  }

  return accounts;
}

/**
 * Create orchestrate command
 */
export function createOrchestrationCommand(): Command {
  const orchestrateCmd = new Command('orchestrate');
  orchestrateCmd.description('Multi-agent task orchestration system');

  // Execute task command
  orchestrateCmd
    .command('run <description>')
    .description('Execute a complex task using multi-agent orchestration')
    .option('-c, --context <text>', 'Additional context for the task')
    .option('-s, --strategy <type>', 'Execution strategy (parallel, sequential, adaptive)', 'adaptive')
    .option('-l, --load-balancing <type>', 'Load balancing strategy (round-robin, least-loaded, cost-optimized)', 'round-robin')
    .option('-m, --max-subtasks <number>', 'Maximum number of sub-tasks', '5')
    .option('--save-doc', 'Save result as a document', false)
    .action(async (description: string, options) => {
      try {
        const accounts = getOrchestrationAccounts();

        if (accounts.length === 0) {
          console.error(chalk.red('❌ No API keys configured.'));
          console.error(chalk.yellow('Set GROK_API_KEY and optionally GROK_API_KEY_2 environment variables.'));
          process.exit(1);
        }

        console.log(chalk.blue(`🚀 Starting multi-agent orchestration with ${accounts.length} account(s)...\n`));

        // Initialize components
        const accountManager = new AccountManager(
          accounts,
          options.loadBalancing as LoadBalancingStrategy
        );

        const superAgent = new SuperAgent(accountManager);
        superAgent.setStrategy(options.strategy as ExecutionStrategy);

        // Execute orchestration
        const taskId = `task-${Date.now()}`;
        console.log(chalk.gray(`Task ID: ${taskId}\n`));

        const result = await superAgent.orchestrate({
          id: taskId,
          description,
          context: options.context,
          maxSubTasks: parseInt(options.maxSubtasks),
        });

        // Display results
        console.log(chalk.green('\n✅ Orchestration Complete\n'));
        console.log(chalk.bold('Task:'), description);
        console.log(chalk.bold('Strategy:'), result.strategy);
        console.log(chalk.bold('Success:'), result.success ? '✅' : '❌');
        console.log(chalk.bold('Execution Time:'), `${(result.executionTime / 1000).toFixed(2)}s`);
        console.log(chalk.bold('Total Tokens:'), result.totalTokens.toLocaleString());
        console.log(chalk.bold('Total Cost:'), `$${result.totalCost.toFixed(4)}`);

        console.log(chalk.bold('\nSub-Tasks:'));
        for (const subTask of result.subTasks) {
          const status = subTask.error ? '❌' : '✅';
          console.log(
            `  ${status} ${chalk.gray(subTask.taskId)}: ${subTask.description}`
          );
          console.log(
            `     Model: ${subTask.model} | Tokens: ${subTask.tokens} | Cost: $${subTask.cost.toFixed(4)}`
          );
        }

        console.log(chalk.bold('\nFinal Result:'));
        console.log(result.finalResult);

        // Save document if requested
        if (options.saveDoc && result.success) {
          const db = new OrchestrationDatabase();
          await db.initialize();

          db.saveDocument({
            task_id: taskId,
            title: description,
            content: result.finalResult,
            format: 'markdown',
          });

          console.log(chalk.green(`\n📄 Document saved to database`));
          db.close();
        }

        // Show account stats
        console.log(chalk.bold('\nAccount Usage:'));
        const stats = accountManager.getStats();
        for (const stat of stats) {
          console.log(
            `  ${chalk.cyan(stat.name)}: ${stat.requests} requests, ${stat.tokens.toLocaleString()} tokens, $${stat.cost.toFixed(4)}`
          );
        }

        if (!result.success) {
          process.exit(1);
        }
      } catch (error: any) {
        console.error(chalk.red(`❌ Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Stats command
  orchestrateCmd
    .command('stats')
    .description('View orchestration statistics')
    .action(async () => {
      try {
        const db = new OrchestrationDatabase();
        await db.initialize();

        const stats = db.getStats();

        console.log(chalk.bold('\n📊 Orchestration Statistics\n'));
        console.log(chalk.cyan('Conversations:'), stats.conversations);
        console.log(chalk.cyan('Documents:'), stats.documents);
        console.log(chalk.cyan('Prompts:'), stats.prompts);
        console.log(chalk.cyan('Agents:'), stats.agents);
        console.log(chalk.gray(`\nDatabase: ${db.getDatabasePath()}`));

        db.close();
      } catch (error: any) {
        console.error(chalk.red(`❌ Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Prompt commands
  const promptCmd = orchestrateCmd.command('prompt');
  promptCmd.description('Manage prompt templates');

  promptCmd
    .command('list')
    .description('List all prompt templates')
    .action(async () => {
      try {
        const db = new OrchestrationDatabase();
        await db.initialize();

        const library = new PromptLibrary(db);
        await library.initialize();

        const templates = library.listTemplates();

        console.log(chalk.bold('\n📝 Prompt Templates\n'));

        for (const template of templates) {
          console.log(chalk.cyan(template.name));
          if (template.description) {
            console.log(chalk.gray(`  ${template.description}`));
          }
          console.log(
            chalk.yellow(`  Variables: ${template.variables.join(', ')}`)
          );
          console.log();
        }

        db.close();
      } catch (error: any) {
        console.error(chalk.red(`❌ Error: ${error.message}`));
        process.exit(1);
      }
    });

  promptCmd
    .command('show <name>')
    .description('Show a prompt template')
    .action(async (name: string) => {
      try {
        const db = new OrchestrationDatabase();
        await db.initialize();

        const library = new PromptLibrary(db);
        await library.initialize();

        const template = library.getTemplate(name);

        if (!template) {
          console.error(chalk.red(`❌ Template '${name}' not found`));
          process.exit(1);
        }

        console.log(chalk.bold(`\n📝 Template: ${template.name}\n`));

        if (template.description) {
          console.log(chalk.gray(template.description));
          console.log();
        }

        console.log(chalk.yellow(`Variables: ${template.variables.join(', ')}`));
        console.log();
        console.log(chalk.bold('Template:'));
        console.log(template.template);

        db.close();
      } catch (error: any) {
        console.error(chalk.red(`❌ Error: ${error.message}`));
        process.exit(1);
      }
    });

  promptCmd
    .command('render <name>')
    .description('Render a prompt template with variables')
    .option('-v, --vars <vars...>', 'Variables in key=value format')
    .action(async (name: string, options) => {
      try {
        const db = new OrchestrationDatabase();
        await db.initialize();

        const library = new PromptLibrary(db);
        await library.initialize();

        // Parse variables
        const variables: Record<string, string> = {};
        if (options.vars) {
          for (const varStr of options.vars) {
            const [key, ...valueParts] = varStr.split('=');
            if (key && valueParts.length > 0) {
              variables[key] = valueParts.join('=');
            }
          }
        }

        const rendered = library.render(name, variables);

        console.log(chalk.bold('\n📄 Rendered Prompt:\n'));
        console.log(rendered);

        db.close();
      } catch (error: any) {
        console.error(chalk.red(`❌ Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Documents command
  orchestrateCmd
    .command('docs')
    .description('List saved documents')
    .option('-l, --limit <number>', 'Maximum number of documents to show', '10')
    .action(async (options) => {
      try {
        const db = new OrchestrationDatabase();
        await db.initialize();

        const documents = db.getAllDocuments(parseInt(options.limit));

        console.log(chalk.bold('\n📚 Saved Documents\n'));

        if (documents.length === 0) {
          console.log(chalk.gray('No documents found'));
        } else {
          for (const doc of documents) {
            console.log(chalk.cyan(`${doc.id}. ${doc.title}`));
            console.log(chalk.gray(`   Task: ${doc.task_id}`));
            console.log(chalk.gray(`   Format: ${doc.format}`));
            console.log(chalk.gray(`   Created: ${doc.created_at}`));
            console.log();
          }
        }

        db.close();
      } catch (error: any) {
        console.error(chalk.red(`❌ Error: ${error.message}`));
        process.exit(1);
      }
    });

  return orchestrateCmd;
}
