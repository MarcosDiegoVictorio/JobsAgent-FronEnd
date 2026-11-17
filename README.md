# JobAgent Frontend

Aplicação Angular 21 independente para operar o JobAgent. A API .NET fica no repositório `job-agent-backend`.

## Executar localmente

1. Instale Node.js e npm.
2. Instale as dependências:

   ```powershell
   npm install
   ```

3. Inicie a API em `http://localhost:5065` e o frontend:

   ```powershell
   npm start
   ```

   A interface abre em `http://localhost:4200`; `proxy.conf.json` encaminha chamadas `/api` para a API local.

## Build e configuração da API

```powershell
npm run build
```

O build é gravado em `dist/job-agent-frontend/browser` e não copia arquivos para o backend.

Antes de hospedar o frontend separado, edite `public/config.js` e defina `apiBaseUrl` para a URL pública da API incluindo `/api`, por exemplo `https://api.exemplo.com/api`. Configure o backend para aceitar a origem do frontend em `Cors:AllowedOrigins`.

O frontend não deve conter chaves de API ou outros segredos. Essas credenciais pertencem exclusivamente à configuração do backend.

## Perfis e fontes de vagas

Na aba **Perfil do Candidato**, você pode salvar perfis nomeados e ativar um deles. Cada perfil mantém seus filtros e histórico de vagas separados; o histórico antigo fica no perfil padrão. A coleta automática inclui a Gupy. Os links de InfoJobs, Catho e Indeed abrem pesquisas nesses sites, e os feeds RSS adicionais podem ser configurados na aba de configurações.
