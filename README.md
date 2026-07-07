<div align="center">

# 🖥️ VPS Setup

**CLI moderne pour le provisioning de serveurs VPS avec Ansible**

Gérez plusieurs serveurs, profiles de configuration et historique des déploiements — le tout depuis un CLI élégant et intuitif.

[![GitHub release](https://img.shields.io/github/v/release/MakFly/vps-setup?style=for-the-badge&logo=github&color=blue)](https://github.com/MakFly/vps-setup/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?style=for-the-badge&logo=bun)](https://bun.sh)
[![Ansible](https://img.shields.io/badge/automation-Ansible-red?style=for-the-badge&logo=ansible)](https://ansible.com)

[Installation](#-installation) • [Démarrage rapide](#-démarrage-rapide) • [Documentation](#-documentation) • [Contribuer](#-développement)

</div>

---

## ✨ Fonctionnalités

- 🚀 **Installation en une commande** — Script d'installation automatique
- 🎯 **Gestion multi-serveurs** — Configurez et gérez plusieurs VPS facilement
- 📦 **Profiles réutilisables** — Créez des templates de configuration pour différents types de serveurs
- 📜 **Historique des déploiements** — Traçabilité complète de vos provisionings
- 🎨 **Interface TUI interactive** — Menu visuel pour les opérations courantes
- ⚡ **Rapide et léger** — Binaire compilé natif, démarrage instantané
- 🔐 **SSH natif** — Test de connexion intégré avant provisioning

---

## 📦 Installation

### Via script d'installation (recommandé)

```bash
curl -fsSL https://raw.githubusercontent.com/MakFly/vps-setup/main/install.sh | bash
```

### Via téléchargement direct

<details>
<summary><b>🐧 Linux x64</b></summary>

```bash
curl -fsSL https://github.com/MakFly/vps-setup/releases/latest/download/vps-setup-linux-x64 \
  -o ~/.local/bin/vps-setup && chmod +x ~/.local/bin/vps-setup
```
</details>

<details>
<summary><b>🐧 Linux ARM64</b></summary>

```bash
curl -fsSL https://github.com/MakFly/vps-setup/releases/latest/download/vps-setup-linux-arm64 \
  -o ~/.local/bin/vps-setup && chmod +x ~/.local/bin/vps-setup
```
</details>

<details>
<summary><b>🍎 macOS (Apple Silicon)</b></summary>

```bash
curl -fsSL https://github.com/MakFly/vps-setup/releases/latest/download/vps-setup-darwin-arm64 \
  -o ~/.local/bin/vps-setup && chmod +x ~/.local/bin/vps-setup
```
</details>

<details>
<summary><b>🍎 macOS (Intel)</b></summary>

```bash
curl -fsSL https://github.com/MakFly/vps-setup/releases/latest/download/vps-setup-darwin-x64 \
  -o ~/.local/bin/vps-setup && chmod +x ~/.local/bin/vps-setup
```
</details>

<details>
<summary><b>🪟 Windows x64</b></summary>

```powershell
# PowerShell
Invoke-WebRequest -Uri "https://github.com/MakFly/vps-setup/releases/latest/download/vps-setup-windows-x64.exe" -OutFile "vps-setup.exe"
```
</details>

### Depuis les sources

```bash
git clone https://github.com/MakFly/vps-setup.git
cd vps-setup
bun install
bun run build
cp dist/vps-setup ~/.local/bin/
```

---

## 🚀 Démarrage rapide

```bash
# 1. Initialiser la configuration
vps-setup init

# 2. Ajouter votre premier serveur
vps-setup server add prod-web --host 192.168.1.100 --user root

# 3. Tester la connexion
vps-setup server test prod-web

# 4. Provisionner avec un profile
vps-setup setup prod-web --profile full-stack
```

Ou lancez simplement `vps-setup` pour accéder au menu interactif :

```
╔═══════════════════════════════════════════════════════════════╗
║                    🖥️  VPS Setup Manager                       ║
╚═══════════════════════════════════════════════════════════════╝

  Servers: 2 | Profiles: 3

  > 🚀 Setup server with profile
    🖥️  Manage servers
    📋 Manage profiles
    📜 View history
    ⚙️  Settings
    👋 Exit
```

---

## 📖 Documentation

### Gestion des serveurs

| Commande | Description |
|----------|-------------|
| `vps-setup server add <name>` | Ajouter un nouveau serveur |
| `vps-setup server list` | Lister tous les serveurs |
| `vps-setup server show <name>` | Afficher les détails d'un serveur |
| `vps-setup server edit <name>` | Modifier la configuration d'un serveur |
| `vps-setup server delete <name>` | Supprimer un serveur |
| `vps-setup server test <name>` | Tester la connexion SSH |

**Exemple :**

```bash
vps-setup server add prod-db \
  --host 10.0.0.50 \
  --user admin \
  --port 2222 \
  --tags database,production
```

### Gestion des profiles

| Commande | Description |
|----------|-------------|
| `vps-setup profile create <name>` | Créer un nouveau profile |
| `vps-setup profile list` | Lister tous les profiles |
| `vps-setup profile show <name>` | Afficher les détails d'un profile |
| `vps-setup profile edit <name>` | Modifier un profile |
| `vps-setup profile delete <name>` | Supprimer un profile |
| `vps-setup profile duplicate <src> <dst>` | Dupliquer un profile |

### Provisioning

| Commande | Description |
|----------|-------------|
| `vps-setup setup <server>` | Provisioning interactif |
| `vps-setup setup <server> --profile <name>` | Avec un profile spécifique |
| `vps-setup setup <server> --dry-run` | Mode simulation (pas de changements) |
| `vps-setup setup <server> --tags docker,security` | Exécuter seulement certains rôles |
| `vps-setup setup --all --profile <name>` | Appliquer à tous les serveurs |
| `vps-setup setup --local --profile local-docker` | Préparer la machine locale sans hardening VPS |
| `vps-setup rebuild export ./bundle --profile vps-docker` | Exporter une configuration reconstructible |
| `vps-setup rebuild apply ./bundle --host <ip> --user root` | Rejouer la configuration sur un nouveau VPS |
| `vps-setup rebuild doctor <server>` | Vérifier SSH, Docker, PostgreSQL, Redis et UFW |

### Historique & Status

```bash
# Voir l'historique d'un serveur
vps-setup history prod-web

# Les 10 derniers déploiements
vps-setup history prod-web --last 10

# Vérifier le statut (SSH + services)
vps-setup status prod-web
```

---

## 📁 Structure de configuration

```
~/.config/vps-setup/
├── config.yml              # Configuration globale
├── servers/
│   ├── prod-web.yml        # Configuration serveur
│   ├── prod-db.yml
│   └── staging.yml
├── profiles/
│   ├── full-stack.yml      # Serveur complet
│   ├── minimal.yml         # Docker + sécurité
│   ├── security-only.yml   # Hardening uniquement
│   ├── local-docker.yml    # Stack locale sans hardening VPS
│   ├── vps-docker.yml      # Docker apps + PostgreSQL system-wide
│   └── vps-bare-metal.yml  # Caddy/systemd + PostgreSQL system-wide
└── history/
    ├── prod-web.log        # Historique par serveur
    └── prod-db.log
```

Runtime Ansible assets are installed separately under:

```text
~/.local/share/vps-setup/ansible/
```

---

## 🎨 Profiles par défaut

| Profile | Description | Composants |
|---------|-------------|------------|
| `full-stack` | Serveur de développement complet | Docker, PHP-FPM, Caddy, Node.js, Bun, Security |
| `minimal` | Installation minimale | Docker, Security |
| `security-only` | Hardening uniquement | Security |
| `local-docker` | Machine locale de développement | Docker, Caddy, Node.js, Bun |
| `vps-docker` | VPS robuste avec apps Docker | Docker, Caddy, PostgreSQL system-wide, Redis, Users, Security, Rebuild |
| `vps-bare-metal` | VPS robuste sans apps Docker | Caddy, PHP-FPM, Node.js, Bun, PostgreSQL system-wide, Redis, Users, Security, Rebuild |

PostgreSQL est installé en service système via le dépôt officiel PGDG. Les conteneurs Docker se connectent par défaut via `host.docker.internal:5432`; le port `5432` n'est pas ouvert publiquement par UFW.

---

## ⚙️ Prérequis

| Outil | Version | Installation |
|-------|---------|--------------|
| **Ansible** | >= 2.14 | `pip install ansible` ou `brew install ansible` |
| **SSH** | — | Accès configuré vers les serveurs cibles |

---

## 🔧 Intégration Ansible

VPS Setup inclut les playbooks et rôles Ansible directement dans le répertoire `ansible/`.

**Structure :**

```
vps-setup/
├── src/                    # CLI TypeScript
├── ansible/                # Playbooks & rôles Ansible
│   ├── ansible.cfg
│   ├── Makefile
│   ├── playbooks/
│   │   ├── site.yml        # Playbook principal
│   │   ├── provision.yml
│   │   └── security.yml
│   ├── roles/
│   │   ├── docker/         # Installation Docker
│   │   ├── php_fpm/        # PHP-FPM + extensions
│   │   ├── caddy/          # Serveur web Caddy
│   │   ├── nodejs/         # Node.js
│   │   ├── bun/            # Runtime Bun
│   │   └── security/       # Hardening serveur
│   ├── inventory/
│   ├── vars/
│   ├── scripts/
│   └── files/
├── documentation/          # Site de documentation (Astro)
└── package.json
```

---

## 🛠️ Développement

```bash
# Cloner et installer
git clone https://github.com/MakFly/vps-setup.git
cd vps-setup
bun install

# Mode développement
bun run dev --help

# Build local
bun run build

# Build toutes plateformes
bun run build:all

# Tests
bun test
```

---

## 📜 Licence

Ce projet est sous licence [MIT](LICENSE).

---

<div align="center">

**Fait avec ❤️ par [MakFly](https://github.com/MakFly)**

[Signaler un bug](https://github.com/MakFly/vps-setup/issues) • [Demander une fonctionnalité](https://github.com/MakFly/vps-setup/issues)

</div>
