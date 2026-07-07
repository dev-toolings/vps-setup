#!/bin/bash
#
# VPS Setup CLI Installer
# Install:     curl -fsSL https://raw.githubusercontent.com/MakFly/vps-setup/main/install.sh | bash
# Uninstall:   curl -fsSL https://raw.githubusercontent.com/MakFly/vps-setup/main/install.sh | bash -s -- --uninstall
#
# Options (via env vars):
#   METHOD=binary   Download pre-built binary (default)
#   METHOD=bun      Install via bun
#   METHOD=source   Build from source
#

set -e

REPO="MakFly/vps-setup"
BINARY_NAME="vps-setup"
INSTALL_DIR="$HOME/.local/bin"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/vps-setup"
ANSIBLE_DIR="$DATA_DIR/ansible"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    VPS Setup Installer                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Detect OS and architecture
detect_platform() {
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)

    case $OS in
        darwin) OS="darwin" ;;
        linux)  OS="linux" ;;
        *)
            echo -e "${RED}Unsupported OS: $OS${NC}"
            exit 1
            ;;
    esac

    case $ARCH in
        x86_64|amd64) ARCH="x64" ;;
        arm64|aarch64) ARCH="arm64" ;;
        *)
            echo -e "${RED}Unsupported architecture: $ARCH${NC}"
            exit 1
            ;;
    esac

    echo -e "${GREEN}Detected platform: $OS-$ARCH${NC}"
}

# Check if bun is installed
check_bun() {
    if command -v bun &> /dev/null; then
        echo -e "${GREEN}✓ Bun is installed${NC}"
        return 0
    else
        echo -e "${YELLOW}Bun is not installed${NC}"
        return 1
    fi
}

# Download Ansible runtime assets
install_ansible_assets() {
    echo -e "${BLUE}Installing Ansible assets...${NC}"

    local ASSET_NAME="vps-setup-ansible.tar.gz"
    local DOWNLOAD_URL="https://github.com/$REPO/releases/latest/download/${ASSET_NAME}"
    local TEMP_DIR
    TEMP_DIR=$(mktemp -d)

    mkdir -p "$DATA_DIR"

    echo -e "${BLUE}Downloading from: $DOWNLOAD_URL${NC}"

    if command -v curl &> /dev/null; then
        curl -fsSL "$DOWNLOAD_URL" -o "$TEMP_DIR/$ASSET_NAME"
    elif command -v wget &> /dev/null; then
        wget -q "$DOWNLOAD_URL" -O "$TEMP_DIR/$ASSET_NAME"
    else
        echo -e "${RED}Neither curl nor wget is available${NC}"
        rm -rf "$TEMP_DIR"
        exit 1
    fi

    rm -rf "$ANSIBLE_DIR"
    tar -xzf "$TEMP_DIR/$ASSET_NAME" -C "$DATA_DIR"
    rm -rf "$TEMP_DIR"

    echo -e "${GREEN}✓ Ansible assets installed to: $ANSIBLE_DIR${NC}"
}

# Install via bun
install_via_bun() {
    echo -e "${BLUE}Installing via bun...${NC}"

    if ! check_bun; then
        echo -e "${YELLOW}Installing bun first...${NC}"
        curl -fsSL https://bun.sh/install | bash
        export PATH="$HOME/.bun/bin:$PATH"
    fi

    # Install globally
    bun install -g "github:$REPO"
    install_ansible_assets

    echo -e "${GREEN}✓ Installed via bun${NC}"
}

# Download pre-built binary
download_binary() {
    echo -e "${BLUE}Downloading pre-built binary...${NC}"

    local ASSET_NAME="vps-setup-${OS}-${ARCH}"
    if [ "$OS" = "windows" ]; then
        ASSET_NAME="${ASSET_NAME}.exe"
    fi

    DOWNLOAD_URL="https://github.com/$REPO/releases/latest/download/${ASSET_NAME}"

    # Create install directory
    mkdir -p "$INSTALL_DIR"

    # Download binary
    echo -e "${BLUE}Downloading from: $DOWNLOAD_URL${NC}"

    if command -v curl &> /dev/null; then
        curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/vps-setup"
    elif command -v wget &> /dev/null; then
        wget -q "$DOWNLOAD_URL" -O "$INSTALL_DIR/vps-setup"
    else
        echo -e "${RED}Neither curl nor wget is available${NC}"
        exit 1
    fi

    # Make executable
    chmod +x "$INSTALL_DIR/vps-setup"

    echo -e "${GREEN}✓ Binary installed to: $INSTALL_DIR/vps-setup${NC}"
    install_ansible_assets

    # Check if in PATH
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        echo -e "${YELLOW}⚠ $INSTALL_DIR is not in your PATH${NC}"
        echo -e "${YELLOW}Add this to your shell config (~/.zshrc or ~/.bashrc):${NC}"
        echo -e "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
}

# Build from source
build_from_source() {
    echo -e "${BLUE}Building from source...${NC}"

    if ! check_bun; then
        echo -e "${YELLOW}Installing bun first...${NC}"
        curl -fsSL https://bun.sh/install | bash
        export PATH="$HOME/.bun/bin:$PATH"
    fi

    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"

    # Clone repo
    echo -e "${BLUE}Cloning repository...${NC}"
    git clone "https://github.com/$REPO.git" .

    # Install dependencies
    echo -e "${BLUE}Installing dependencies...${NC}"
    bun install

    # Build binary
    echo -e "${BLUE}Building binary...${NC}"
    bun run build

    # Install
    mkdir -p "$INSTALL_DIR"
    cp dist/vps-setup "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/vps-setup"

    mkdir -p "$DATA_DIR"
    rm -rf "$ANSIBLE_DIR"
    cp -R ansible "$ANSIBLE_DIR"

    # Cleanup
    cd "$HOME"
    rm -rf "$TEMP_DIR"

    echo -e "${GREEN}✓ Built and installed to: $INSTALL_DIR/vps-setup${NC}"
}

# Uninstall
uninstall() {
    echo -e "${BLUE}Uninstalling vps-setup...${NC}"
    echo

    local removed=0

    # Remove binary
    if [ -f "$INSTALL_DIR/vps-setup" ]; then
        rm -f "$INSTALL_DIR/vps-setup"
        echo -e "${GREEN}✓ Removed $INSTALL_DIR/vps-setup${NC}"
        removed=1
    fi

    # Remove config directory
    local CONFIG_DIR="$HOME/.config/vps-setup"
    if [ -d "$CONFIG_DIR" ]; then
        echo -e "${YELLOW}Found config directory: $CONFIG_DIR${NC}"
        if [ -t 0 ]; then
            read -p "Remove config and data? [y/N] " confirm
            if [[ "$confirm" =~ ^[Yy]$ ]]; then
                rm -rf "$CONFIG_DIR"
                echo -e "${GREEN}✓ Removed $CONFIG_DIR${NC}"
            else
                echo -e "${BLUE}Kept $CONFIG_DIR${NC}"
            fi
        else
            echo -e "${YELLOW}Skipping config removal (non-interactive). Remove manually:${NC}"
            echo -e "  rm -rf $CONFIG_DIR"
        fi
    fi

    if [ "$removed" -eq 0 ]; then
        echo -e "${YELLOW}vps-setup was not found in $INSTALL_DIR${NC}"
    fi

    echo
    echo -e "${GREEN}✓ vps-setup uninstalled${NC}"
    echo
}

# Main installation flow
main() {
    # Handle --uninstall flag
    if [ "${1:-}" = "--uninstall" ]; then
        uninstall
        exit 0
    fi

    detect_platform
    echo

    # Determine install method
    local method="${METHOD:-}"

    # If stdin is a terminal (interactive), show menu
    if [ -t 0 ] && [ -z "$method" ]; then
        echo -e "${BLUE}Choose installation method:${NC}"
        echo "  1) Download pre-built binary (recommended)"
        echo "  2) Install via bun"
        echo "  3) Build from source"
        echo
        read -p "Enter choice [1-3] (default: 1): " choice
        choice=${choice:-1}

        case $choice in
            1) method="binary" ;;
            2) method="bun" ;;
            3) method="source" ;;
            *)
                echo -e "${RED}Invalid choice${NC}"
                exit 1
                ;;
        esac
    fi

    # Default to binary download (non-interactive / curl pipe)
    method="${method:-binary}"

    echo -e "${BLUE}Install method: $method${NC}"
    echo

    case $method in
        binary)
            download_binary
            ;;
        bun)
            install_via_bun
            ;;
        source)
            build_from_source
            ;;
        *)
            echo -e "${RED}Unknown method: $method${NC}"
            echo "Valid methods: binary, bun, source"
            exit 1
            ;;
    esac

    echo
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  Installation Complete!                       ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo
    echo -e "Run ${BLUE}vps-setup init${NC} to get started"
    echo -e "Run ${BLUE}vps-setup --help${NC} for all commands"
    echo
}

main "$@"
