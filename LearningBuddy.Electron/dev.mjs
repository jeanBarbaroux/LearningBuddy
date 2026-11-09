// Development loop: builds, starts Electron, then rebuilds and restarts it after every change in src/
// or in the bundled packages.
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './build.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const electron = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
let child = null;
let timer = null;
let building = false;

async function restart() {
  if (building) {
    return;
  }

  building = true;
  try {
    if (child) {
      child.removeAllListeners('exit');
      child.kill();
      child = null;
    }

    await buildApp();
    console.log(`[dev] ${new Date().toLocaleTimeString()} — lancement d’Electron`);
    child = spawn(electron, ['.'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => {
      console.log(`[dev] Electron s’est arrêté (code ${code}). En attente de modifications…`);
      child = null;
    });
  } catch (error) {
    console.error('[dev] Échec de la compilation :', error.message);
  } finally {
    building = false;
  }
}

function scheduleRestart() {
  clearTimeout(timer);
  timer = setTimeout(restart, 250);
}

watch(path.join(root, 'src'), { recursive: true }, scheduleRestart);
watch(path.resolve(root, '..', 'assets'), { recursive: true }, scheduleRestart);
await restart();
