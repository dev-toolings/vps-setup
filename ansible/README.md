# VPS Setup - Ansible Provisioning

Automated VPS provisioning with interactive component selection.

## Supported OS

- Debian 12 (Bookworm)
- Ubuntu 24.04 (Noble)

## Components

| Component | Description |
|-----------|-------------|
| **Docker** | Docker Engine + Docker Compose + UFW fix |
| **PHP-FPM** | PHP FastCGI Process Manager (no Apache/Nginx) |
| **Caddy** | Reverse proxy with automatic HTTPS |
| **Node.js** | JavaScript runtime (system-wide via NodeSource) |
| **NVM** | Node Version Manager (per-user) |
| **Bun** | Fast JavaScript/TypeScript runtime |
| **Security** | UFW firewall, fail2ban, SSH hardening |

## Quick Start

### 1. Interactive Menu

```bash
make menu
```

Select components with number keys, press `d` to confirm.

### 2. Run Provisioning

```bash
make run HOST=192.168.1.100 USER=root
```

### 3. One-liner (all defaults)

```bash
make quick HOST=192.168.1.100 USER=root
```

## Usage

### Generate Config (CLI)

```bash
./files/menu/generate_config.sh --docker --nodejs --security --user ubuntu
```

### Dry Run (Check Mode)

```bash
make check HOST=192.168.1.100
```

### Security Only

```bash
make security HOST=192.168.1.100
```

### Run Specific Tags

```bash
ansible-playbook -i 192.168.1.100, playbooks/site.yml \
  --tags "docker,security" \
  --skip-tags "php_fpm"
```

## Prerequisites

### Control Machine

```bash
pip install ansible
```

### Target VPS

- Fresh Debian 12 or Ubuntu 24.04
- SSH access with key authentication
- Sudo/root privileges

## ⚠️ Important: SSH Key Check

Before running security hardening, ensure SSH keys are configured:

```bash
make validate HOST=192.168.1.100
```

The security role includes a **pre-flight check** that will warn you if no SSH keys are detected.

## Directory Structure

```
ansible/
├── ansible.cfg              # Ansible configuration
├── Makefile                 # Quick commands
├── inventory/
│   ├── hosts.yml            # Host inventory
│   └── group_vars/          # Variables by group
├── playbooks/
│   ├── site.yml             # Main entry point
│   ├── provision.yml        # Full provisioning
│   └── security.yml         # Security only
├── roles/
│   ├── common/              # Base system setup
│   ├── security/            # UFW + fail2ban + SSH
│   ├── docker/              # Docker + UFW fix
│   ├── php_fpm/             # PHP-FPM standalone
│   ├── caddy/               # Reverse proxy
│   ├── nodejs/              # Node.js system-wide
│   ├── nvm/                 # NVM per-user
│   └── bun/                 # Bun runtime
├── files/menu/
│   ├── menu.sh              # Interactive TUI
│   └── generate_config.sh   # CLI generator
├── scripts/
│   ├── setup.sh             # Quick start
│   └── validate_ssh_key.sh  # SSH key check
└── vars/
    └── default_components.yml
```

## Security Features

### UFW Firewall
- Default deny incoming
- Allow: SSH, HTTP, HTTPS
- Logging enabled

### fail2ban
- SSH: 3 failed attempts = 1 hour ban
- 10-minute monitoring window

### SSH Hardening
- Key authentication only
- Root login disabled
- Strong cryptography (Ed25519, ChaCha20)
- Connection keepalive

### Docker + UFW Fix
Docker manipulates iptables directly, bypassing UFW. This setup:
1. Keeps Docker iptables support enabled
2. Uses UFW and DOCKER-USER integration for Docker traffic policy
3. Lets containers reach system-wide PostgreSQL through `host.docker.internal`

## Verification

After provisioning, verify services:

```bash
# UFW
sudo ufw status verbose

# fail2ban
sudo fail2ban-client status sshd

# Docker
docker --version
docker compose version

# PHP-FPM
systemctl status php8.2-fpm

# Caddy
systemctl status caddy
curl -I http://localhost

# Node.js
node --version
npm --version

# Bun
bun --version
```

## Configuration Examples

### Minimal (Docker + Node.js + Bun)

```yaml
# provision_config.yml
vps_components:
  docker: true
  php_fpm: false
  caddy: false
  nodejs: true
  nvm: false
  bun: true
  security: true

runtime_user: "ubuntu"
```

### Full Stack (with PHP + Caddy)

```yaml
# provision_config.yml
vps_components:
  docker: true
  php_fpm: true
  caddy: true
  nodejs: true
  nvm: false
  bun: true
  security: true

runtime_user: "www-data"
```

## Idempotence

All roles are idempotent. Running the playbook multiple times will not make unnecessary changes.

```bash
# Test idempotence
ansible-playbook -i 192.168.1.100, playbooks/site.yml
ansible-playbook -i 192.168.1.100, playbooks/site.yml
# Second run should show changed=0
```

## License

MIT
