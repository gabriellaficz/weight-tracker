#!/bin/bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

# Block non-root logins while bootstrapping and show a clear message
echo "Codex-CLI image is booting. Please reconnect in a few minutes (typically 3 minutes to boot)." >/etc/nologin

# Visible markers
echo "BOOTSTRAP: start" | tee /var/log/bootstrap.marker

retry() { n=0; until "$@"; do n=$((n+1)); [ $n -ge 5 ] && exit 1; sleep $((2*n)); done; }

# Base
apt-get update
apt-get -y upgrade
apt-get install -y --no-install-recommends ca-certificates curl git build-essential unzip gnupg ufw jq

# Docker
install -m 0755 -d /etc/apt/keyrings
retry curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" >/etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker ubuntu

echo "BOOTSTRAP: docker done" | tee -a /var/log/bootstrap.marker

# Node via nvm and Codex CLI (as ubuntu login shell)
su -l ubuntu -c 'set -euxo pipefail
  retry() { n=0; until "$@"; do n=$((n+1)); [ $n -ge 5 ] && exit 1; sleep $((2*n)); done; }
  export NVM_DIR="$HOME/.nvm"
  [ -d "$NVM_DIR" ] || retry curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  . "$NVM_DIR/nvm.sh"
  retry nvm install --lts
  nvm alias default "lts/*"
  retry npm i -g @openai/codex
  mkdir -p "$HOME/.codex"
'

# Write config.toml as ubuntu (heredoc outside the su command)
cat <<'EOF' | su -l ubuntu -c 'cat > "$HOME/.codex/config.toml"'
approval_policy = "never"
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = true

[profiles.yolo]
EOF

echo "BOOTSTRAP: codex installed and config written" | tee -a /var/log/bootstrap.marker

# PATH shim and global codex link
cat >/etc/profile.d/90-nvm-codex.sh <<'EOF'
export NVM_DIR="/home/ubuntu/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(dirname "$(command -v node)")"
  case ":$PATH:" in *":$NODE_BIN:"*) ;; *) export PATH="$NODE_BIN:$PATH";; esac
fi
EOF
chmod 644 /etc/profile.d/90-nvm-codex.sh
ln -sf "$(dirname "$(su - ubuntu -c 'command -v node')")/codex" /usr/local/bin/codex || true

# UFW: deny inbound by default, allow SSH; outbound allowed by default
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

cat >/etc/update-motd.d/00-clear <<'SH'
#!/bin/sh
# clear the terminal before showing MOTD
printf '\033c'
SH
chmod +x /etc/update-motd.d/00-clear

# IMDSv2 - get the public IP address of this machine
TOKEN=$(curl -fsS -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
PUBLIC_IP=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/public-ipv4)

# MOTD
cat >/etc/motd <<EOF
Codex EC2 ready.

Headless login:
  1) Run this to connect with port forwarding so you can click login link: ssh -i [keyfile] -L 1455:127.0.0.1:1455 ubuntu@${PUBLIC_IP}
  2) Run codex, then click the printed URL in your local browser to complete sign-in.

Github Personal Access Token quick howto:
  1) In GitHub, go to Settings → Developer settings → Personal Access Tokens, create a PAT with repo scope (fine-grained can be restricted to a single repo, read or readwrite).
  2) In this machine, run: git clone https://<TOKEN>@github.com/<OWNER>/<REPO>.git
  3) Codex can now pull (and push if auth'd) the repo

Run long codex sessions inside a screen:
  screen -S codex
  codex --yolo

Detach:  Ctrl-a d     Reattach:  screen -r codex
List active:  screen -ls

EOF

echo "BOOTSTRAP: done" | tee -a /var/log/bootstrap.marker

# Ready: remove login block
rm -f /etc/nologin

