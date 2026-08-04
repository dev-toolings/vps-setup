<div align="center">

# 🖥️ VPS Setup

**CLI moderne pour le provisioning de serveurs VPS avec Ansible**

Gérez plusieurs serveurs, profiles de configuration et historique des déploiements, le tout depuis un CLI élégant et intuitif.

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

### Audit du durcissement

`vps-setup audit <serveur>` vérifie, en lecture seule, que le durcissement est
réellement en place sur un serveur déjà provisionné. Contrairement à `rebuild doctor`,
qui se contente de sonder des services, cette commande **juge** et **sort en code non nul
quand un contrôle échoue**. Elle est faite pour être branchée dans un pipeline.

| Option | Effet |
|--------|-------|
| `--deploy-user <nom>` | Compte de déploiement à contrôler (défaut `deploy`) |
| `--strict` | Les contrôles indéterminés (`SKIP`) deviennent bloquants |
| `--json` | Sortie machine, pour la CI |

Neuf contrôles : UFW actif, configuration OpenSSH valide, login root refusé, mots de passe
refusés, keyboard-interactive refusé, fail2ban et son jail `sshd` actifs, existence du
compte de déploiement, clé SSH installée avec un `~/.ssh` en 0700, aucune mise à jour de
sécurité en attente.

Trois verdicts, et la nuance est tout l'intérêt de la commande :

| Verdict | Signification exacte |
|---------|----------------------|
| `[OK]` | La sonde a tourné avec les privilèges nécessaires et n'a rien trouvé |
| `[FAIL]` | La sonde a tourné et a trouvé un problème réel. Jamais « peut-être mauvais » |
| `[SKIP]` | La sonde n'a pas pu mesurer de façon fiable. Jamais « mesuré et douteux » |

Un `[SKIP]` se produit dans deux cas seulement : `sudo` lui-même inutilisable, donc la
sonde n'a pas pu être tentée (les contrôles qui exigent root essaient d'abord un repli
`sudo -n`), et mesure dont la fraîcheur n'est pas garantie. Tout le reste est un `[FAIL]`.

La nuance qui compte, et qui a été tranchée explicitement : **l'absence du binaire
contrôlé est une réponse, pas une mesure manquée.** Un hôte sans `ufw` installé n'est pas
un hôte dont on ignore l'état du pare-feu, c'est un hôte sans pare-feu. Le contrôle rend
donc `[FAIL]`. Même chose pour `fail2ban`, pour une configuration `sshd` invalide, ou pour
un jail `sshd` inexistant : ce sont des défauts constatés.

Codes de sortie : `0` si aucun `FAIL`, `1` sinon. `--strict` fait basculer les `SKIP` du
côté de l'échec, ce qui est le mode à utiliser en CI.

**Limite connue.** `ufw` et `sshd` vivent dans `/usr/sbin`, hors du `PATH` par défaut d'un
compte non-root. La classification ne fait donc confiance qu'à la tentative `sudo -n`, dont
le `secure_path` inclut `/usr/sbin` sur Debian et Ubuntu. Un `sudoers` personnalisé sans
`secure_path` ferait remonter un `FAIL` sur un `ufw` pourtant installé. Le détail affiché
sous le contrôle (`sudo: ufw: command not found`) permet de reconnaître ce cas
immédiatement. Nous n'ajoutons pas de sonde supplémentaire pour le couvrir : coder des
chemins absolus échangerait une dépendance à la configuration `sudo` contre une dépendance
à l'emplacement des binaires, qui varie davantage entre distributions.

**Le contrôle des mises à jour est volontairement restreint à la sécurité.** Le rôle
`hardening` n'applique automatiquement que le pocket sécurité, donc les paquets ordinaires
s'accumulent par conception. Un contrôle « aucun paquet en attente » échouerait en
permanence sur le profil qu'il certifie, et un audit qui ne passe jamais au vert apprend à
son lecteur à l'ignorer. La commande ne rafraîchit jamais le cache apt, puisqu'elle est en
lecture seule : au-delà de sept jours d'ancienneté du cache, elle rend `SKIP` plutôt
qu'affirmer un `[OK]` calculé sur un index périmé.

```bash
vps-setup audit prod-web                    # audit lisible
vps-setup audit prod-web --json --strict    # usage CI, tout indéterminé bloque
```

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
| `vps-private` | VPS d'administration sans port public | Tailscale, Security, Users, Hardening, Rebuild |

PostgreSQL est installé en service système via le dépôt officiel PGDG. Les conteneurs Docker se connectent par défaut via `host.docker.internal:5432`; le port `5432` n'est pas ouvert publiquement par UFW.

---

## 🕸️ Profil `vps-private` (accès privé, aucun port public) — expérimental

> **Expérimental : jamais exécuté contre un vrai tailnet.** Les rôles `tailscale` et
> `hardening` ont été validés par analyse de syntaxe, rendu de templates et harnais à
> backend simulé. Aucun démon `tailscaled` réel n'a jamais répondu à ce code, et aucune
> règle UFW n'a été appliquée sur une machine vivante. Les gardes décrites plus bas sont
> conçues pour échouer plutôt que de fermer un port sans chemin de retour, mais cette
> propriété n'a été prouvée que localement.
>
> **Validez ce profil sur un VPS jetable avant tout usage réel**, avec une console KVM
> ouverte chez l'hébergeur. Ce qui reste non mesuré : le contenu de `tailscale status
> --json` selon l'état du backend, l'idempotence de la suppression de règle UFW, et le
> comportement IPv6 quand la règle SSH publique est retirée.

Ce profil produit une posture **opposée** à celle des autres. Le serveur n'expose aucun
port TCP public et l'administration passe exclusivement par un tailnet Tailscale. Ce n'est
pas un cran de durcissement supplémentaire, c'est un autre modèle de menace : un VPS sans
port public ne peut pas servir de site web, ni obtenir un certificat via ACME HTTP-01.
Docker, Caddy, PHP-FPM, Node.js et les bases de données y sont donc désactivés. Pour un
hôte applicatif public, restez sur `vps-docker`, `vps-bare-metal` ou `vps-swarm`.

**Avant de lancer.** Générez une clé de pré-authentification dans la console Tailscale
(idéalement réutilisable et éphémère) et passez-la en `-e tailscale_auth_key=<clé>`. Elle
ne doit jamais figurer dans un fichier de profil ni dans un commit. Si le nœud est déjà
connecté au tailnet manuellement, la clé est inutile.

**Ordre d'exécution, appliqué par `provision.yml` et non négociable :**

```
1. rôle tailscale   installe, rejoint le tailnet, PROUVE la connectivité
                    (BackendState == Running + adresse IPv4 du tailnet lue)
                         │
                         ▼  fait tailscale_ipv4
2. rôle security    autorise SSH sur tailscale0, PUIS retire la règle publique
                         │
                         ▼
3. rôle hardening   AppArmor + mises à jour de sécurité automatiques
```

Si la preuve de connectivité manque, l'étape 2 échoue au lieu de continuer. Un `when` qui
saute silencieusement la fermeture du port laisserait croire au succès, et l'inverse
fermerait le port sans chemin de retour. Les deux sont des façons de perdre le serveur.

**Variables à fournir :**

| Variable | Rôle |
|----------|------|
| `tailscale_auth_key` | Obligatoire au premier provisioning si le nœud n'est pas déjà connecté. À passer par `-e` ou un vault, jamais en clair dans un fichier versionné |
| `ssh_allow_users` | Comptes autorisés par OpenSSH (défaut du profil : `["deploy"]`). Doit toujours inclure `deploy_user`, sinon le provisioning échoue avant d'écrire quoi que ce soit |
| `ufw_ssh_interface` | Interface qui porte SSH (défaut du profil : `"tailscale0"`) |
| `ufw_allowed_ports` | **À vider** (`[]`) pour tenir la promesse « zéro port public ». Le profil CLI le fait pour vous, une invocation `ansible-playbook` directe non |

`ufw_ssh_interface` **déplace** SSH hors de l'interface publique, il ne ferme pas les
autres ports. Le défaut global `ufw_allowed_ports` vaut `[22, 80, 443]` : sans le vider,
vous obtenez un SSH restreint au tailnet et un 80/443 toujours ouverts au monde. Le rôle
refuse désormais cette combinaison, sauf acquittement explicite par
`ufw_ssh_interface_confirm_public_ports: true`.

**Deux points à connaître avant de l'appliquer :**

- Tailscale SSH (`tailscale_ssh_enabled`) est désactivé par défaut, volontairement. C'est
  un serveur SSH parallèle qui court-circuiterait `AllowUsers`, fail2ban et les contrôles
  de `vps-setup audit`. Ne l'activez qu'en sachant que l'audit d'OpenSSH ne dit alors plus
  rien du chemin d'accès réel.
- Les mises à jour automatiques se limitent aux paquets d'origine sécurité et ne
  redémarrent jamais la machine (`Unattended-Upgrade::Automatic-Reboot "false"`). Un
  redémarrage non planifié, ou un verrou `dpkg` pris pendant un déploiement, coûte plus
  cher qu'une mise à jour de noyau différée. Surveillez `/var/run/reboot-required` et
  redémarrez vous-même.

Après application, le compte `root` ne peut plus ouvrir de session SSH : pensez à basculer
l'utilisateur du serveur enregistré vers le compte de déploiement (`vps-setup server edit`).

---

## 🔐 Garde-fou anti-verrouillage

Le durcissement SSH désactive le login root (`ssh_permit_root_login: "no"`). Sur un serveur
où aucun autre compte ne possède de clé, la session suivante est refusée et la machine
n'est plus joignable que par la console KVM de l'hébergeur.

Le rôle `security` refuse donc de s'exécuter tant qu'aucun compte non-root porteur d'une
clé ne survit à l'exécution. Trois sorties de secours explicites :

| Sortie | Comment |
|--------|---------|
| Le rôle `users` tourne dans la même exécution | `vps_components.users: true` avec une source de clés lisible (`deploy_user_authorized_keys_source`) ou une liste `deploy_user_authorized_keys` non vide |
| Le compte existe déjà sur la cible | `{{ deploy_user }}` a déjà un `authorized_keys` non vide, cas d'un rejeu du durcissement seul |
| Acceptation explicite du risque | `allow_ssh_lockout: true` (défaut `false`) |

Conséquences pratiques :

- `vps_components.users` vaut désormais `true` par défaut. Ne livrez jamais
  `security: true` avec `users: false`.
- `playbooks/security.yml` inclut le rôle `users` avant `security`, donc le chemin
  « durcissement seul » crée bien le compte qui survivra.
- La garde constate l'état réel de la cible au moment où elle s'exécute. Elle ne se fie pas
  à la présence d'un composant dans le profil : une sélection par `--tags` peut retirer le
  rôle `users` de l'exécution alors que `vps_components.users` reste à `true`.

**Changement de comportement à connaître.** Le passage de `users` à `true` dans
`group_vars/all.yml` ne touche pas le chemin CLI, qui passe ses composants en extra-vars.
En revanche `make run` et `ansible-playbook playbooks/site.yml` sans extra-vars créent
désormais un compte `deploy` doté de `NOPASSWD:ALL`, là où ils n'en créaient aucun. C'est
le prix de la protection contre le verrouillage. Si ce compte ne vous convient pas, passez
`deploy_user`, `deploy_user_groups` et `deploy_user_passwordless_sudo` explicitement, en
sachant que désactiver `NOPASSWD` sans poser de mot de passe rend `sudo` inutilisable pour
ce compte.

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
