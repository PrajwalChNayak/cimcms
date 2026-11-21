#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { DEVICE_MODES, type Mode } from '@cimcms/contracts';
import { startSimulator } from './simulator.js';

const USAGE = `Usage: npm run sim -- --url mqtt://localhost:1883 --device LED-01 --username LED-01 --password-env SIM_PASSWORD
  [--latency 200] [--fail-rate 0] [--mode MANUAL] [--heartbeat 30]
  [--ignore-commands] [--reject-all <REASON>] [--hardware] [--interactive]
The password is read from the environment variable named by --password-env (never from argv).
Interactive commands: toggle <n> | all on | all off | mode <MODE> | crash | reboot | quit`;

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

function isMode(v: string): v is Mode {
  return (DEVICE_MODES as readonly string[]).includes(v);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      url: { type: 'string', default: 'mqtt://localhost:1883' },
      device: { type: 'string' },
      username: { type: 'string' },
      'password-env': { type: 'string' },
      latency: { type: 'string', default: '200' },
      'fail-rate': { type: 'string', default: '0' },
      mode: { type: 'string', default: 'MANUAL' },
      heartbeat: { type: 'string', default: '30' },
      'ignore-commands': { type: 'boolean', default: false },
      'reject-all': { type: 'string' },
      hardware: { type: 'boolean', default: false },
      interactive: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (values.help || !values.device) {
    out(USAGE);
    process.exit(values.help ? 0 : 2);
  }
  if (!isMode(values.mode)) {
    out(`invalid --mode ${values.mode}; one of ${DEVICE_MODES.join(', ')}`);
    process.exit(2);
  }
  let password: string | undefined;
  const envName = values['password-env'];
  if (envName) {
    password = process.env[envName];
    if (password === undefined) {
      out(`environment variable ${envName} is not set`);
      process.exit(2);
    }
  }

  const sim = await startSimulator({
    url: values.url,
    deviceId: values.device,
    ...(values.username !== undefined && { username: values.username }),
    ...(password !== undefined && { password }),
    latencyMs: Number(values.latency),
    failRate: Number(values['fail-rate']),
    mode: values.mode,
    heartbeatS: Number(values.heartbeat),
    ignoreCommands: values['ignore-commands'],
    ...(values['reject-all'] !== undefined && { rejectAll: values['reject-all'] }),
    hardware: values.hardware,
    log: out,
  });
  out(`simulator ${values.device} online (boot_id ${sim.state.bootId})`);

  const shutdown = async (): Promise<void> => {
    await sim.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  if (!values.interactive) return;
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (raw) => {
    const [cmd, arg] = raw.trim().split(/\s+/);
    const run = async (): Promise<void> => {
      if (cmd === 'toggle' && arg) await sim.toggle(Number(arg));
      else if (cmd === 'all' && (arg === 'on' || arg === 'off')) await sim.setAll(arg === 'on');
      else if (cmd === 'mode' && arg && isMode(arg.toUpperCase())) await sim.setMode(arg.toUpperCase() as Mode);
      else if (cmd === 'crash') await sim.crash();
      else if (cmd === 'reboot') await sim.reboot();
      else if (cmd === 'quit') await shutdown();
      else out('unknown command');
    };
    run().catch((err: unknown) => out(`error: ${String(err)}`));
  });
}

main().catch((err: unknown) => {
  out(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
