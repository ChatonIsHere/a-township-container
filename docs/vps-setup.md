# Hosting this on a VPS

This walks you through renting a small Linux server (a VPS), securing it, and getting the container running. It assumes you've never touched a VPS and that this one will only run the game server, so everything is explained and nothing extra is installed. If you know what you're doing, skim for the parts you need.

Written in July 2026. Providers and installers change, so if a button has moved or a command misbehaves, have a quick search before pinging me!

Do the sections in order, and actually read the SSH warnings. Skipping them is how you lock yourself out of your own server.

## What you need

A VPS is a computer in someone else's datacentre that you rent. There's no screen or mouse, so you'll use a couple of tools you might not have before:

- [PuTTY](https://www.putty.org/) (the installer includes PuTTYgen, which we also need)
- [WinSCP](https://winscp.net/)

And:

- Your `game-source` folder, with `A Township Tale.exe` and `A Township Tale_Data` directly inside it, as described in [the patching guide](patching-installation.md#making-the-game-source-folder). No patching needed, the container does that
- ~$5-10 a month for the VPS

## Generating an SSH key

An SSH key is a pair of files: a private key that stays on your PC, and a public key that goes on the server. Together they let you log in without a password, and unlike a password nobody can brute-force one. We make it before renting the VPS because most hosts can install it for you while setting the server up.

1. Open `PuTTYgen` (search for it, it came with PuTTY)
2. Set a `Key passphrase` if you want one. You'll type it each time you connect
3. Click `Save private key` and put it somewhere safe, like `Documents\ssh\att-server.ppk`. This file is the key to your server, so don't share it or lose it
4. Copy all of the text in the box labelled `Public key for pasting into OpenSSH authorized_keys file` (one long line starting with `ssh-`) and paste it into a text file for later. Don't use `Save public key`, it saves in a format Linux won't accept

## Getting a VPS

Any provider with Ubuntu works: Hetzner, OVH, Netcup, DigitalOcean, Vultr, whoever. I use Hetzner, mostly out of habit.

- At least 2 CPU cores and 4GB of RAM. I'm testing on a Hetzner CX33, but a CX23 should be enough
- 40GB of disk or more (the game is ~4.4GB, plus the zip while you upload it, the Docker image, Ubuntu and your saves)
- A dedicated IPv4 address. Some hosts sell cheaper IPv6-only servers; the game needs IPv4
- A location close to your players (distance is ping)

If your host has an `SSH key` field when setting the server up, paste your public key in there.

Pick the latest Ubuntu LTS (the `.04` releases from even years, like 24.04, which is what I use) and skip any add-ons like Plesk, cPanel or a LAMP stack.

Once it's created, note the server's public IP. You connect with it and so do your players. If you didn't add a key, the host will show or email you a root password.

## Logging in for the first time

1. Open `PuTTY` and enter the server's IP in `Host Name`. Leave the port as `22`
2. In the tree on the left, go to `Connection` → `SSH` → `Auth` → `Credentials`, click `Browse...` under `Private key file for authentication` and pick your `.ppk`
3. Back in `Session`, type a name under `Saved Sessions` (like `att-server`) and click `Save`
4. Click `Open`. The first time, PuTTY warns about the host key; that's it meeting your server, so accept it. If you see the warning again without having changed anything, look into it
5. Log in as `root`. With a key it logs you straight in (after your passphrase, if you set one); otherwise use the password from your host

You should see a prompt like `root@ubuntu:~#`.

If your host uses a different default user (some use `ubuntu`), their email will say so. Log in as that and put `sudo ` in front of the commands in the next two sections, or run `sudo su` to become root.

## Updating Ubuntu

A fresh image can be weeks out of date:

```bash
apt update
apt upgrade -y
apt autopurge -y
apt autoclean
reboot
```

- If a pink screen asks "Which services should be restarted?" or about a modified config file, press Enter; the defaults are fine
- If `apt` says it's "Waiting for cache lock", Ubuntu's automatic updater is running. Wait a couple of minutes and try again
- `reboot` disconnects you. Wait 30 seconds and reconnect (double-click your saved session)

Ubuntu installs security updates by itself with `unattended-upgrades`. Check it's on:

```bash
systemctl is-enabled unattended-upgrades
```

It should say `enabled`. If the unit doesn't exist, run `apt install -y unattended-upgrades`.

## Creating a user

Doing everything as `root` means one bad command or one compromised session risks the whole machine, so make a normal user, then turn off root's SSH login in the next section.

```bash
adduser att
usermod -aG sudo att
```

Give it a decent password and note it down. Press Enter through the other questions.

Now give `att` your SSH key. If you added the key while setting up the server, copy root's:

```bash
mkdir -p /home/att/.ssh
cp /root/.ssh/authorized_keys /home/att/.ssh/authorized_keys
chown -R att:att /home/att/.ssh
chmod 700 /home/att/.ssh
chmod 600 /home/att/.ssh/authorized_keys
```

If there's no `/root/.ssh/authorized_keys`, make the file yourself:

```bash
mkdir -p /home/att/.ssh
nano /home/att/.ssh/authorized_keys
```

`nano` is a simple text editor. Right-click to paste your public key (the `ssh-` line), press `Ctrl+O` and `Enter` to save, and `Ctrl+X` to exit. Then run the `chown` and `chmod` lines from above.

Test it before going any further: open a second PuTTY window, load your session, and log in as `att`. Don't continue until that works, because next we turn off the root login.

## Locking down SSH

Bots constantly scan the internet for SSH servers and throw passwords at them. The simple fix is to accept no passwords at all and never let anyone in as root. Your `att` user logs in with a key, so both are safe to turn off.

As root (or with `sudo` as `att`), create a config file:

```bash
nano /etc/ssh/sshd_config.d/00-hardening.conf
```

Paste this in, then save and exit:

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
```

Restart SSH so it picks that up:

```bash
systemctl restart ssh
```

Open a third connection and check that `att` still works with your key and that `root` is refused. Only then close the old windows. If something's broken, the still-open session is where you fix it. If you do lock yourself out, most hosts have a web console in their control panel that gets you a local login.

From here on, everything is done as `att`, with `sudo` in front of admin commands.

## Setting up the firewall

UFW blocks every incoming connection you haven't allowed, which here is just SSH. The game's ports don't need UFW rules, since Docker writes its own rules for published ports and bypasses UFW.

```bash
sudo apt install -y ufw
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw enable
```

It warns that enabling may disrupt SSH connections. You allowed 22 first, so answer `y`. Then check it:

```bash
sudo ufw status verbose
```

You should see `Status: active`, the SSH rule (once for IPv4 and once with `(v6)`), and `Default: deny (incoming), allow (outgoing)`.

Many providers also have a firewall in their control panel. If yours is turned on, open the game ports there too: `1757` UDP, and `1760` to `1762` TCP.

## Installing Docker

Install Docker from Docker's own repository, since Ubuntu's `docker.io` package lags behind:

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Let `att` use Docker without `sudo`:

```bash
sudo usermod -aG docker att
```

Being in the `docker` group is effectively root access, since Docker can mount and change anything on the machine. That's fine on a single-purpose server with one admin, just know that `att` isn't a low-privilege account any more.

Close PuTTY and reconnect so the group change applies, then check:

```bash
docker version
```

If it prints both a `Client` and a `Server` section without "permission denied", Docker's ready.

## Setting up the server folder

```bash
mkdir -p ~/att-server/game-source
cd ~/att-server
nano docker-compose.yml
```

Paste in the compose file from the README:

```yaml
services:
    a-township-container:
        image: ghcr.io/chatonishere/a-township-container:latest
        container_name: a-township-container
        restart: unless-stopped
        # time to save the world when stopping
        stop_grace_period: 5m
        # cpus: 2
        # mem_limit: 4g
        volumes:
            - ./game-source:/game-files
            - ./server-data:/root/.wine/drive_c/users/root/AppData/Roaming/A Township Tale
            - ./tavern-config:/root/.wine/drive_c/users/root/AppData/Roaming/TheModdingTavern
            - wine-prefix:/root/.wine
        ports:
            - '${SERVER_PORT:-1757}:${SERVER_PORT:-1757}/udp' # game
            - '1760:1760/tcp' # console, for TavernLauncher's Remote Console
            - '1761:1761/tcp' # the game's web server
            - '1762:1762/tcp' # TavernLib's login
        environment:
            SERVER_PORT: ${SERVER_PORT:-1757}
            AUTO_PATCH: ${AUTO_PATCH:-true}
            DEBUG: ${DEBUG:-false}
            SCENE: ${SCENE:-}
            ATT_ACCESS_TOKEN: ${ATT_ACCESS_TOKEN:-}
            ATT_REFRESH_TOKEN: ${ATT_REFRESH_TOKEN:-}
            ATT_IDENTITY_TOKEN: ${ATT_IDENTITY_TOKEN:-}

volumes:
    wine-prefix:
```

To cap the server's CPU and RAM, uncomment `cpus` and `mem_limit` and set them to what you want. Then save and exit.

## Uploading the game files

Uploading ~4.4GB as thousands of files over SFTP is painfully slow, so zip it first. On your PC, open the `game-source` folder, select everything inside it (`Ctrl+A`), right-click and pick `Compress to ZIP file` (or use 7-Zip). Zip the contents, not the folder, so the files sit at the top of the zip.

Connect with WinSCP:

1. On the login dialog click `Tools` → `Import Sites`, tick your PuTTY session and click `OK`. That brings over the IP and your key. (Or fill it in: protocol `SFTP`, your IP, port `22`, user `att`, and your key under `Advanced` → `SSH` → `Authentication`)
2. Log in as `att` (root can't log in any more, that was the point)
3. The right-hand pane is the server, starting in `/home/att`. Open `att-server`, then `game-source`
4. Drag `game-source.zip` from the left into `game-source`. This is the long part, go drink some water

Once it's uploaded, back in PuTTY:

```bash
sudo apt install -y unzip
cd ~/att-server/game-source
unzip game-source.zip
ls
```

`ls` needs to show `A Township Tale.exe` and `A Township Tale_Data`. If it shows a single folder instead, you zipped the folder rather than its contents. Fix it with:

```bash
mv game-source/* game-source/.[!.]* . 2>/dev/null; rmdir game-source
```

Then delete the zip to get the space back:

```bash
rm game-source.zip
```

## Starting the server

```bash
cd ~/att-server
docker compose up -d
docker compose logs -f
```

The first start is slow: Docker downloads the image, then the container downloads the mods and patch before the game boots. Press `Ctrl+C` to stop watching the logs; the server keeps running in the background (that's the `-d`).

Day to day:

```bash
docker compose logs -f     # watch the logs
docker compose ps          # is it running?
docker compose restart     # restart it
docker compose down        # stop it
docker compose up -d       # start it again
```

Your world saves are in `~/att-server/server-data` and TavernLib's config (`server_settings.json`, `users.json`) in `~/att-server/tavern-config`. Those are the folders to back up. They belong to `att`, so you can edit them without `sudo`. TavernLib also archives the game's log in `server-data/Servers/-1/Logs/logs/Archives` at every start and every 10MB, keeping 20, so that folder can reach a couple of hundred MB; skip it in backups if space is tight.

Give it a minute or two after the logs settle, then connect from the game using your server's IP.

## Updating

```bash
cd ~/att-server
docker compose pull
docker compose up -d
docker image prune -f   # optional, removes the old image
```

This doesn't touch your game files, saves or config. The mods and patch are checked on every start anyway. To force a full re-patch, run `docker compose down`, then `docker compose run --rm a-township-container update`.

## Troubleshooting

**I'm locked out of SSH.**
Use your host's web console (Hetzner's is the `>_` button). It doesn't go through SSH. Log in as `att` with the password you set in `adduser`, fix what broke (usually `/etc/ssh/sshd_config.d/00-hardening.conf` or a missing UFW rule) with `sudo nano`, and run `sudo systemctl restart ssh`.

**"Permission denied (publickey)" when connecting.**
Most likely first:

- You're connecting as the wrong user (use `att`)
- `authorized_keys` has the wrong content. It needs the single `ssh-` line from PuTTYgen's box, not a file from `Save public key`
- The `chown`/`chmod` lines were skipped. SSH ignores keys in folders it thinks are too open

**Password login still works after locking down SSH.**
Another config file is winning. Check with `sudo sshd -T | grep -i passwordauthentication`. If it says `yes`, look in `/etc/ssh/sshd_config.d/` for something like `50-cloud-init.conf` that sets it, and make sure your file's name sorts before it (that's what the `00-` is for). Restart ssh afterwards.

**`docker: permission denied while trying to connect to the Docker daemon socket`.**
Your session started before you joined the `docker` group. Log out and back in. If it still happens, check `groups` lists `docker`.

**The container exits with "A Township Tale.exe is missing from /game-files".**
The game isn't directly inside `game-source`. `ls ~/att-server/game-source` should show `A Township Tale.exe` and `A Township Tale_Data`, not another folder.

**Nobody can connect.**

1. **The host's firewall.** This is the big one. Hetzner Cloud Firewalls, AWS security groups, Oracle Cloud (which blocks nearly everything by default), Azure NSGs and so on sit in front of the VPS, and neither UFW nor Docker sees what they drop. Open `1757` UDP and `1760` to `1762` TCP there, or check no such firewall is attached
2. **Is it running?** `docker compose ps` should say `Up` (not `Restarting`), and `sudo ss -ulpn | grep 1757` should show a listener
3. **A changed port.** If you set `SERVER_PORT` in `.env`, open that port instead of `1757`

**`ufw status` doesn't mention the game ports.**
That's expected. Docker writes its own firewall rules for published ports, bypassing UFW. Only publish ports you want public (this compose file only publishes the game's).

**The server dies after running a while and the logs just stop.**
On a 4GB server this is usually Linux running out of memory. Fresh cloud images have no swap, so add 2GB:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

`sudo dmesg | grep -i "out of memory"` confirms it.

**Disk full (`no space left on device`).**
`df -h` shows what's using it. Delete `game-source.zip` if it's still there, and run `docker image prune -f` to drop old images.
