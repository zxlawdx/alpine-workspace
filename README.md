# PIBIC Workspace

Interface web leve para administracao e desenvolvimento em uma VM Alpine Linux.

## Arquitetura

- Backend Python no Alpine
- Interface HTML/CSS/JavaScript renderizada no navegador do cliente
- Terminal PTY real via WebSocket/xterm.js
- Editor de codigo e gerenciador de arquivos
- Integracao com APK, OpenRC e Docker
- Telemetria de CPU, RAM, armazenamento, processos e rede

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

O projeto nao deve alterar SSH, porta 22, DNS, interfaces de rede, firewall ou ZeroTier durante uma atualizacao de interface.

## Estrutura

```text
app/      backend e APIs
web/      frontend e assets locais
deploy/   exemplos de integracao com OpenRC
```

## Desenvolvimento

Nao publique senhas, tokens, arquivos `.env`, bancos locais, logs ou backups no repositorio.
