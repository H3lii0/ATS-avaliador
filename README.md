# Análise Curricular

Aplicação web para avaliar currículos com critérios compatíveis com sistemas de triagem (ATS). O projeto permite enviar um currículo em PDF ou DOCX e escolher entre uma análise geral de estrutura ou uma comparação direcionada a uma vaga.

A aplicação foi desenvolvida com Next.js, não exige login e processa cada arquivo apenas durante a requisição. Não há banco de dados nem armazenamento permanente de currículos.

## Funcionalidades

- Upload de currículos em PDF pesquisável ou DOCX.
- Análise geral de compatibilidade com padrões ATS.
- Comparação com uma descrição de vaga colada pelo usuário.
- Comparação com uma URL pública de vaga em HTTPS.
- Identificação de termos encontrados e requisitos que merecem revisão.
- Verificação de seções, contato, datas, extensão, resultados mensuráveis e legibilidade.
- Indicadores explicados em um painel expansível na tela de resultados.
- Aviso quando uma página de vaga não puder ser lida com segurança ou tiver conteúdo possivelmente incompleto.

## Como a análise funciona

### Análise ATS

Verifica se o currículo possui elementos que facilitam a leitura automática:

- contato identificável;
- resumo profissional;
- experiência;
- formação;
- competências;
- quantidade adequada de texto;
- datas reconhecíveis;
- resultados mensuráveis;
- texto legível e não corrompido.

### Comparação com uma vaga

A comparação combina dois componentes:

- **65% de compatibilidade textual:** termos relevantes extraídos da vaga e encontrados no currículo;
- **35% de estrutura ATS:** critérios de organização e legibilidade do currículo.

A cobertura de termos é uma indicação inicial, não uma comprovação definitiva de experiência. Termos equivalentes ou habilidades descritas com outra expressão podem exigir revisão manual.

### Comparação por link

Para URLs públicas, o servidor tenta extrair primeiro dados estruturados `JobPosting` e depois o conteúdo HTML visível. O sistema aceita apenas HTTPS, limita redirecionamentos e tamanho de página e bloqueia destinos locais.

Páginas que exigem login, carregam o conteúdo exclusivamente com JavaScript ou bloqueiam automação podem apresentar uma leitura incompleta. Nesses casos, o resultado informa o usuário e recomenda colar a descrição da vaga.

## Executar localmente

Requisitos: Node.js 22.x e npm. O projeto usa essa versão para manter o runtime da Vercel consistente com o leitor de PDF (`pdfjs-dist`).

```bash
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

Para executar uma versão de produção localmente:

```bash
npm run build
npm run start
```

## Scripts disponíveis

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # build de produção
npm run start        # inicia o build de produção
npm run lint         # verifica problemas de código
npm test             # executa os testes automatizados
npm run format       # formata os arquivos
npm run format:check # verifica a formatação
```

## Limites e proteções

- Currículos limitados a 3 MB.
- Solicitações multipart limitadas a 4 MB.
- PDFs limitados a 20 páginas.
- PDF e DOCX têm sua estrutura validada antes do processamento.
- Até quatro análises simultâneas por processo.
- Rate limit em memória de dez solicitações por cliente a cada dez minutos.
- URLs de vagas exigem HTTPS na porta padrão.
- Bloqueio de redes locais e endereços reservados para reduzir riscos de SSRF.
- Páginas de vagas limitadas a 2 MB, com timeout e até três redirecionamentos.
- Mensagens de erro internas não são expostas diretamente ao navegador.

O rate limit é local ao processo. Em uma implantação com múltiplas instâncias, o controle deve ser complementado pelos recursos da plataforma ou por um armazenamento compartilhado, como Redis.

## Privacidade

O currículo é convertido e analisado em memória durante a requisição. O projeto não possui autenticação, banco de dados ou histórico de análises. O conteúdo do currículo não deve ser adicionado a logs durante futuras alterações.

As fontes utilizadas pela interface são hospedadas no próprio projeto, sem chamadas do navegador ao Google Fonts.

## Limitações conhecidas

- PDFs escaneados ou formados apenas por imagens não possuem OCR.
- A pontuação utiliza regras explicáveis e não representa um ATS comercial específico.
- A comparação textual não substitui uma avaliação semântica completa.
- A análise com IA ainda não faz parte do fluxo principal.
- Sites com autenticação, CAPTCHA, bloqueio de automação ou renderização exclusivamente no navegador podem exigir que a descrição seja colada manualmente.

## Qualidade do projeto

Antes de publicar uma alteração, execute:

```bash
npm run format:check
npm run lint
npm test
npm run build
```

Os testes cobrem as regras de análise ATS, reconhecimento de seções, comparação de termos, extração de documentos e proteções das requisições.
