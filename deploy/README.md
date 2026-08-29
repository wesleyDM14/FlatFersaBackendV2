# Deploy do FlatFersa API na VPS (Docker + Nginx)

Objetivo: sair do Heroku e rodar a API dentro do `docker-compose.yml` que já existe na VPS,
ao lado dos outros serviços (jpl-solar, cied, etc). **O banco não muda de lugar** — a API
continua apontando para o mesmo MySQL da hospedagem compartilhada da Hostinger
(`DATABASE_URL` no `.env`). Isso elimina qualquer risco de perda de dados na troca de host.

## 1. Levar o código para a VPS

Na raiz dos projetos da VPS (onde já ficam `jpl-solar/`, `cied/`, `docker-compose.yml`, `nginx.conf`):

```bash
git clone https://github.com/wesleyDM14/FlatFersaBackendV2.git flatfersa-api
```

(ou copie os arquivos manualmente — o importante é a pasta se chamar `flatfersa-api` para bater
com o `docker-compose.snippet.yml` e o `Dockerfile` que já estão neste diretório `deploy/`).

## 2. Criar o `.env` de produção na VPS

Dentro de `flatfersa-api/.env` (na VPS, **nunca commitado**), cole as mesmas variáveis do seu
`.env` local atual (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `WORDPRESS_*`, `EMAIL_*`, `SMTP_*`,
`ADMIN_EMAIL`) — são exatamente as mesmas credenciais já usadas no Heroku hoje.

## 3. DNS

Crie o registro **A** do subdomínio escolhido apontando para o IP da VPS (ex: `api.flatfersa...`).
Espere propagar antes de pedir o certificado.

## 4. Adicionar o serviço ao `docker-compose.yml`

Cole o conteúdo de `docker-compose.snippet.yml` dentro de `services:` no `docker-compose.yml` da VPS,
e adicione `flatfersa-api` na lista `depends_on:` do serviço `nginx`.

## 5. Nginx — primeiro só o bloco HTTP (para o desafio do certbot)

Abra `nginx-flatfersa.conf`, troque `{{DOMINIO_BACKEND}}` pelo domínio real, e cole **só o primeiro
bloco `server { listen 80; ... }`** no `nginx.conf` da VPS (ainda sem o bloco `listen 443 ssl`).

Suba a API e recarregue o nginx:

```bash
docker compose up -d --build flatfersa-api
docker compose up -d nginx
```

## 6. Emitir o certificado SSL

```bash
docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d SEU_DOMINIO_AQUI
```

## 7. Nginx — agora o bloco HTTPS completo

Volte no `nginx-flatfersa.conf`, cole também o segundo bloco (`listen 443 ssl`) no `nginx.conf`,
e recarregue:

```bash
docker compose exec nginx nginx -s reload
```

## 8. Testar

```bash
curl -I https://SEU_DOMINIO_AQUI/login
```

Deve responder com um status HTTP (400/405), não erro de conexão nem 502.

## 9. Antes de aplicar o novo schema no banco de produção — BACKUP primeiro

Esta versão adiciona ao `Contrato`: uma coluna nova (`contratoAnteriorId`, opcional) e dois
valores novos no enum de status (`RENOVADO`, `TRANSFERIDO`). É uma mudança aditiva — não apaga
nem renomeia nada — mas em banco de produção compartilhado, backup é inegociável:

```bash
mysqldump -h srv540.hstgr.io -u SEU_USUARIO -p SEU_BANCO > backup_antes_flatfersa_v2.sql
```

Depois, aplique o schema novo com **uma das duas opções**:

**Opção A — Prisma (mais simples, mesmo fluxo que o projeto já usa hoje, já que não existe
histórico de migrations neste repositório):**

```bash
npx prisma db push
```
(rode isso de qualquer máquina com acesso à porta do MySQL da Hostinger — inclusive de dentro
do container `flatfersa-api` via `docker compose exec flatfersa-api npx prisma db push`)

**Opção B — SQL manual (mais visível/controlável em hospedagem compartilhada):**

```sql
ALTER TABLE `Contrato` ADD COLUMN `contratoAnteriorId` VARCHAR(191) NULL;

ALTER TABLE `Contrato` MODIFY COLUMN `status` ENUM(
  'SOLICITADO','AGUARDANDO_DADOS_DONO','AGUARDANDO_ASSINATURA','ATIVO',
  'ENCERRADO','CANCELADO','DESPEJO','RENOVADO','TRANSFERIDO'
) NOT NULL DEFAULT 'SOLICITADO';

CREATE INDEX `Contrato_contratoAnteriorId_idx` ON `Contrato`(`contratoAnteriorId`);

ALTER TABLE `Contrato` ADD CONSTRAINT `Contrato_contratoAnteriorId_fkey`
  FOREIGN KEY (`contratoAnteriorId`) REFERENCES `Contrato`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
```

## 10. Frontend

Nenhum container novo para o frontend. Antes de rodar `npm run build`, garanta que
`REACT_APP_BACKEND_URL` no `.env` do frontend aponte para `https://SEU_DOMINIO_AQUI`. Depois
suba o conteúdo da pasta `build/` para a hospedagem Hostinger como já é feito hoje.
