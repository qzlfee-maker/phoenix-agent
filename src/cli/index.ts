import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import { getPhoenixDir, DEFAULT_API_URL, DEFAULT_MODEL, loadConfig } from '../server/config.js';
import { startServer } from '../server/index.js';

export async function runCLI() {
  const banner = `
 ${chalk.bold.hex('#FF5500')(' ____  _                     _      ')}
 ${chalk.bold.hex('#FF7700')('|  _ \\| |__   ___   ___ _ __ (_)_  __')}
 ${chalk.bold.hex('#FF9900')('| |_) | \'_ \\ / _ \\ / _ \\ \'_ \\| \\ \\/ /')}
 ${chalk.bold.hex('#FFBB00')('|  __/| | | | (_) |  __/ | | | |>  < ')}
 ${chalk.bold.hex('#FFDD00')('|_|   |_| |_|\\___/ \\___|_| |_|_/_/\\_\\')}
                                        
 ${chalk.bold.white('Local-First Autonomous AI Agent')} ${chalk.hex('#FF8800')('v0.1.0')}
`;
  console.log(banner);

  // Parse optional port flag: --port <num> or -p <num>
  let preferredPort = 3000;
  const portIndex = process.argv.findIndex((arg) => arg === '--port' || arg === '-p');
  if (portIndex !== -1 && process.argv[portIndex + 1]) {
    const parsed = parseInt(process.argv[portIndex + 1], 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
      preferredPort = parsed;
    }
  }

  const spinner = ora({
    text: chalk.cyan('Starting Phoenix local server...'),
    color: 'yellow',
  }).start();

  try {
    const { server, port, url } = await startServer(preferredPort);
    spinner.succeed(chalk.green(`Phoenix is running on ${chalk.bold.underline(url)}`));

    const border = chalk.gray('───────────────────────────────────────────────────────');
    console.log(`\n${border}`);
    console.log(` ${chalk.bold.hex('#FF7700')('⚡ Local Web UI:')}    ${chalk.cyan.underline(url)}`);
    console.log(` ${chalk.bold.hex('#FF7700')('📁 Storage Path:')}    ${chalk.gray(getPhoenixDir())}`);
    console.log(`${border}\n`);
    console.log(chalk.gray(' Web-first onboarding enabled. Configure keys directly in the browser.'));
    console.log(chalk.gray(' Press Ctrl+C at any time to shut down the server.\n'));

    // Handle graceful shutdown
    const cleanup = async () => {
      console.log(chalk.yellow('\nShutting down Phoenix...'));
      try {
        await server.close();
      } catch {}
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Open browser automatically
    try {
      await open(url);
    } catch {
      // Ignored if headless
    }
  } catch (err: any) {
    spinner.fail(chalk.red(`Failed to start Phoenix: ${err?.message || err}`));
    process.exit(1);
  }
}
