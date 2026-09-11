# Alpine Workspace

Interface web leve para administracao, observabilidade e desenvolvimento em uma VM Alpine Linux.

Versao atual: **4.1.0**.

## Arquitetura

- Backend Python/FastAPI no Alpine
- Interface HTML/CSS/JavaScript renderizada no navegador do cliente
- Terminal PTY real via WebSocket/xterm.js
- Editor de codigo e gerenciador de arquivos
- Integracao com APK, OpenRC e Docker
- Telemetria de CPU, RAM, armazenamento, processos, usuarios e rede
- Dashboard com atualizacao silenciosa, sem reconstruir a pagina a cada ciclo

## Navegacao v4

A sidebar possui telas reais para:

- Dashboard
- Sistema & Risco
- Processos
- Armazenamento & Disco
- Rede
- Usuarios
- Acesso SSH
- Rede Privada

Os modulos mais complexos reutilizam os aplicativos funcionais existentes do Workspace e abrem em janelas sobre a nova interface:

- Terminal
- Codigo
- Arquivos
- Pacotes APK
- Docker
- Servicos OpenRC
- Logs
- Configuracoes

## Seguranca de acesso

O servico deve permanecer restrito ao loopback da VM:

```text
127.0.0.1:8765
```

Para acesso remoto, use um SSH Local Port Forward. Exemplo:

```bash
ssh -N -L 18765:127.0.0.1:8765 usuario@servidor
```

Depois abra `http://127.0.0.1:18765` no navegador local.

As APIs administrativas continuam protegidas por sessao do navegador, verificacao de Host/Origin e CSRF nas operacoes que alteram estado. O endpoint `/api/health` permanece apropriado para health check sem sessao.

O projeto nao deve alterar SSH, porta 22, DNS, interfaces de rede, firewall ou ZeroTier durante uma atualizacao de interface.

## Estrutura

```text
app/              backend e APIs
web/              frontend e assets locais
deploy/           integracao com OpenRC
update-local.sh   aplica com backup o checkout na instalacao /opt
```

## Atualizar uma VM que ja possui o Workspace

No checkout local:

```bash
cd ~/pibic-workspace-repo
git pull --ff-only
doas sh ./update-local.sh
```

O `update-local.sh`:

1. cria backup de `app/`, `web/` e `VERSION`;
2. copia o checkout para `/opt/pibic-workspace`;
3. valida o backend Python;
4. reinicia somente `pibic-workspace`;
5. testa `http://127.0.0.1:8765/api/health`;
6. faz rollback automatico se a validacao falhar.

A VM nao e reiniciada e o script nao edita SSH, rede, DNS, firewall ou ZeroTier.

## Desenvolvimento

Nao publique senhas, tokens, arquivos `.env`, bancos locais, logs ou backups no repositorio.
