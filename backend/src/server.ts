import { createApp } from './app';
import { iniciarBanco } from './db';

async function main() {
  await iniciarBanco();
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, '0.0.0.0', () => {
    console.log(`CasaXP rodando na porta ${port}`);
  });
}

main().catch((err) => {
  console.error('Falha ao iniciar o CasaXP:', err);
  process.exit(1);
});
