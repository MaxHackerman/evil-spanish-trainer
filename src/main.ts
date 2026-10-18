import './ui/styles.css';
import { createServices } from './services/container.ts';
import { App } from './ui/app.ts';

const root = document.getElementById('app');
if (root) {
  createServices()
    .then((services) => new App(root, services).start())
    .catch((e: unknown) => {
      root.textContent = `Ошибка запуска: ${String(e)}`;
    });
}
