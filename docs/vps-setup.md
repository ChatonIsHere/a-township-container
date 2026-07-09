# Hosting this on a VPS

This guide walks you through renting a small Linux server (a VPS), reasonably securing it, and getting the container running on it. I'm going to treat you like you've never touched a VPS before and that this machine will only ever run this game server, so everything is explained and nothing extra is installed. If you do happen to know what you're doing, I'm sure you'll have no problem picking out the relevant parts of the guide.

Disclaimer: This information is as accurate as I could get as of the time of writing, July 2026. Providers and installers change constantly, so if a button isn't quite where I say it is or an argument isn't behaving, give it a quick search before pinging me!

One thing before we start, please for the love of all things do the sections in order, and actually read the SSH warnings. Skipping them is how you lock yourself out of your own server.

## Prerequisites

A VPS is just a computer in someone else's datacentre that you rent. You generally don't get a screen or a mouse, so you'll need to use a couple things you've probably not touched before.

- [PuTTY](https://www.putty.org/) installed (the installer includes PuTTYgen, which we also need)
- [WinSCP](https://winscp.net/) installed

You'll also need to make sure you've got the following on-hand:

- Your prepared `game-source` folder, meaning a clean A Township Tale install with the client and server packages extracted into it, exactly as described in [the README](../README.md#setting-up-the-game-source-folder). Check that `A Township Tale.exe`, `startServer.bat`, and `version.dll` are sitting directly inside `game-source` before going any further
- The three tokens (access, refresh, identity). Open the `server.bat` from the server package in a text editor and copy them out somewhere safe
- ~$5-10 a month for the VPS itself

## Generating an SSH key

An SSH key is a pair of files; one is a private key that stays on your PC, and a public key that goes on the server. Together they let you log in without a password, and unlike a password, nobody can brute-force their way through one within the confines of the rest of time as far as we know it. We're making the key before renting the VPS because most hosts let you install it during provisioning, which means less work later.

1. Open `PuTTYgen` on your machine, it came with PuTTY so you should just be able to search for it
2. Set a `Key passphrase` if you want to. If you do, you'll type this each time you connect, so pick something you'll remember
3. Click `Save private key` and put it somewhere safe, like `Documents\ssh\att-server.ppk`
    - This file is the key to your server. Don't share it and don't lose it
4. Copy the entire text from the big box at the top labelled `Public key for pasting into OpenSSH authorized_keys file` (one long line starting with `ssh-`) and paste it into a text file for later
    - Don't use the `Save public key` button, it'll save in a format Linux doesn't accept and you'll be very confused later. Copy it from the box

## Getting a VPS

Any provider works, we just need something that provides an Ubuntu VPS. Hetzner, OVH, Netcup, DigitalOcean, Vultr, whoever. I personally use Hetzner, but that's mostly because it's what I'm used to.

- At least 2 CPU cores and 4GB of RAM (testing is still ongoing on what this server actually needs, but this is a good starting point. I'm testing on a Hetzner CX33, but the CX23 should be enough)
- 40GB of disk or more (the game is ~4.4GB and briefly exists 2-3 times on the server, on top of the Docker image, Ubuntu itself, and your saves. It's also nice to have a little wiggle room for backups and such)
- A dedicated IPv4 address (this is standard, but some hosts now sell cheaper IPv6-only servers. Don't buy one of those, the game needs IPv4)
- A location close to whoever's playing (distance is ping)

During provisioning, most hosts (including Hetzner) have an `SSH key` field. Paste your public key text in there. If your host supports this, you'll never need a password at all and a couple of later steps get easier.

## Installing Ubuntu

Pick the latest Ubuntu LTS as the operating system during provisioning. Most hosts install it for you, so there's usually nothing to actually do here. LTS (long-term support) releases are the stable, boring ones you want on a server because they're reliable and long lived. They're the `.04` versions with an even year, like 24.04. If your host offers a newer LTS that's fine too, but if in doubt, 24.04 is a known-good choice, and the one I'm using!

Skip any control panel add-ons like Plesk, cPanel, LAMP stack, etc... We want plain, minimal Ubuntu.

Once the server is created, you should see the VPS' public IP address somewhere. Note it down, you'll need it to connect and it's what players will use too. If you didn't add an SSH key during provisioning, the host will also show or email you a root password.

## Logging in for the first time

1. Open `PuTTY`
2. In `Host Name`, enter your server's IP. Leave the port as `22`
3. Point PuTTY at your private key
    1. In the tree on the left, expand `Connection`, then `SSH`, then `Auth`
    2. Click `Credentials`
    3. Under `Private key file for authentication`, click `Browse...` and select the private key `.ppk` file from earlier
4. Go back to `Session`, type a name under `Saved Sessions` (like `att-server`), and click `Save` so you never have to do this again
5. Click `Open`
6. The first connection shows a host key fingerprint warning. That's normal, it's just PuTTY meeting your server for the first time. Accept it.
    - If you see it again at some point, and you haven't changed anything regarding how you connect, it's worth looking in to.
7. Log in as `root`. If you added your key during provisioning it should just log you in, though it may asks for your key passphrase if you set that. Otherwise it will ask for the root password that your host gave you

You should now be looking at a prompt like `root@ubuntu:~#`, which means you're connected!

If your host uses a different default user (some use `ubuntu` instead of `root`), their welcome email will say so. Log in as that instead and stick `sudo ` in front of every command in the next two sections so it runs as admin, or try `sudo su` to switch to the root account.

## Updating Ubuntu

A fresh image can be weeks out of date. Update everything, clear out the leftovers, and reboot so you're on the newest version.

```bash
apt update
apt upgrade -y
apt autopurge -y
apt autoclean
reboot
```

- If a pink/purple screen pops up asking "Which services should be restarted?", just press Enter, the defaults are fine (same goes for any menu asking about a modified config file, just keep the local version, which is the default)
- If `apt` complains it's "Waiting for cache lock", Ubuntu's automatic updater is running in the background because the machine just booted. Wait a couple of minutes and try again
- `reboot` will kick you out of PuTTY, this is expected. Wait 30 seconds, then try reconnecting (double click on your saved session)

Ubuntu comes with `unattended-upgrades`, which installs security patches by itself in the background. We do want that working on a machine we're mostly going to ignore, so make sure it's on enabled.

```bash
systemctl is-enabled unattended-upgrades
```

It should say `enabled`. If it says the unit doesn't exist, install it with `apt install -y unattended-upgrades`.

## Creating a user

Doing everything as `root` means one bad command or one compromised session risks the whole machine, so we'll make a normal user for day-to-day stuff and shut root's SSH access off entirely in the next section.

```bash
adduser att
usermod -aG sudo att
```

`adduser` asks for a password, so give it a decent one and make sure to remember it or note it down. Everything else it asks can be skipped with Enter.

Now give the new user your SSH key. If you added your key during provisioning, just copy root's over:

```bash
mkdir -p /home/att/.ssh
cp /root/.ssh/authorized_keys /home/att/.ssh/authorized_keys
chown -R att:att /home/att/.ssh
chmod 700 /home/att/.ssh
chmod 600 /home/att/.ssh/authorized_keys
```

If you didn't add your key during provisioning (there's no `/root/.ssh/authorized_keys`), you'll need to create the file yourself:

```bash
mkdir -p /home/att/.ssh
nano /home/att/.ssh/authorized_keys
```

`nano` is a simple text editor. Paste your public key with a right-click (that single `ssh-` line from PuTTYgen), then press `Ctrl+O`, `Enter` to save and `Ctrl+X` to exit. Then run the `chown`/`chmod` lines from above.

Now it's time to test it before going any further. Open a second PuTTY window, load your saved session, and change the username to `att`. It should accept your key and ask for your passphrase. Do not continue with the guide until this works, because next we're going to disable the root way in.

## Locking down SSH

Bad actors have a habit of constantly scanning the internet for SSH servers and tries throwing passwords at them. You'd probably see a bunch of attempts in your logs within days if you went looking. One easy hardening method is to simply not accept passwords at all, and don't let anyone log in as root. Since your `att` user just logged in with a key, both are now safe to turn off.

As root (or with `sudo` from your `att` session), create a config file:

```bash
nano /etc/ssh/sshd_config.d/00-hardening.conf
```

Paste this in, save, and exit:

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
```

Remember press `Ctrl+O`, `Enter` to save and `Ctrl+X` to exit.

We also need to restart the ssh service to make sure it gets the memo.

```bash
systemctl restart ssh
```

Open a fresh third connection and confirm that `att` with your key still works, and that `root` now gets refused. Only then close the old windows.

This sounds a little overkill but I've been locked out too many times to not at least warn you.

If something's broken, your still-open session is where you fix it. And if you do manage to lock yourself out completely, most hosts have a web-based emergency console in their control panel that can get you a local login to undo the change, or at the very least a web-based terminal where you can log in as root.

From here on, everything is done as the `att` user, with `sudo` in front of administrative commands.

## Setting up the software firewall

UFW (uncomplicated firewall) blocks every incoming connection except the ones you explicitly allow. For this server that's exactly three things: SSH, and the game's two ports.

It's usually preinstalled on Ubuntu, but just in case:

```bash
sudo apt install -y ufw
```

Now it's time to add the rules.

```bash
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 1757/tcp comment 'ATT game'
sudo ufw allow 1757/udp comment 'ATT game'
sudo ufw allow 1761/tcp comment 'ATT game 2'
sudo ufw allow 1761/udp comment 'ATT game 2'
```

We want to make sure that's worked before we enable it, so run the below:

```bash
sudo ufw status verbose
```

You should see all five rules (each listed twice, once for IPv4 and once with `(v6)` next to it, which is normal) and `Default: deny (incoming), allow (outgoing)`. As long as you see a rule there for port 22, we're all good! We can now enable the firewall.

```bash
sudo ufw enable
```

It warns that enabling may disrupt existing SSH connections. You allowed 22 first, so answer `y`.

It's worth noting that many providers have their own firewall in the control panel. Most aren't enabled by default, but if yours is, the game ports might need opening there too. See [Troubleshooting](#troubleshooting) for more information.

## Installing Docker

Docker is the engine that actually runs the server container. We'll install it from Docker's own repository, as Ubuntu's built-in `docker.io` package tends to lag behind.

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

And for ease of use, we'll also allow your `att` user to manage Docker without needing `sudo` every time.

```bash
sudo usermod -aG docker att
```

It's worth noting that being in the `docker` group is effectively root access, since Docker can mount and modify anything on the machine. That's fine on a single-purpose game server with one admin, just understand that `att` isn't a low-privilege account once it's in this group.

The group change only applies to new logins, so close PuTTY and reconnect, and then check that it's worked.

```bash
docker version
```

If both a `Client` and `Server` section print without a "permission denied" error, Docker's ready to go!

## Setting up the server folder

Make a home for the ATT server and its config:

```bash
mkdir -p ~/att-server
cd ~/att-server
nano docker-compose.yml
```

Paste in the compose file, same as the README:

```yaml
services:
    a-township-container:
        image: ghcr.io/chatonishere/a-township-container:latest
        container_name: a-township-container
        restart: unless-stopped
        # Uncomment the following lines to limit CPU and memory usage
        # cpus: 2
        # mem_limit: 4g
        cap_add:
            - SYS_PTRACE
        security_opt:
            - seccomp:unconfined
        volumes:
            - ./game-source:/game-source:ro
            - game-files:/game-files
            - ./server-data:/root/.wine/drive_c/users/root/AppData/Roaming/A Township Tale
            - wine-prefix:/root/.wine
        ports:
            - '${SERVER_PORT:-1757}:${SERVER_PORT:-1757}/udp'
            - '${SERVER_PORT:-1757}:${SERVER_PORT:-1757}/tcp'
            - '${SERVER_PORT_2:-1761}:${SERVER_PORT_2:-1761}/udp'
            - '${SERVER_PORT_2:-1761}:${SERVER_PORT_2:-1761}/tcp'
        environment:
            SERVER_PORT: ${SERVER_PORT:-1757}
            ATT_ACCESS_TOKEN: ${ATT_ACCESS_TOKEN}
            ATT_REFRESH_TOKEN: ${ATT_REFRESH_TOKEN}
            ATT_IDENTITY_TOKEN: ${ATT_IDENTITY_TOKEN}

volumes:
    wine-prefix:
    game-files:
```

If you want or need to limit the server's container with maximum CPU and RAM limits, uncomment the `cpus: 2` and `mem_limit: 4g` lines and adjust them to what you want.

Save and exit, then create the `.env` file that holds your tokens:

```bash
nano .env
```

```
ATT_ACCESS_TOKEN=paste-your-access-token-here
ATT_REFRESH_TOKEN=paste-your-refresh-token-here
ATT_IDENTITY_TOKEN=paste-your-identity-token-here
```

No quotes, no spaces around the `=`. Make this file here on the server with nano rather than uploading it from Windows. Windows text files have invisible line-ending characters that can sometimes corrupt the tokens.

Since the tokens are technically secrets, make the file readable only by you. Right now we're all using the same ones, but that might change!

```bash
chmod 600 .env
```

## Uploading the game files

Time to get your prepared `game-source` folder onto the VPS. Uploading ~4.4GB as thousands of individual files over SFTP is painfully slow, so zip it first on your PC. Select everything in the folder, right-click, and pick `Compress to ZIP file` (or use 7-Zip). This should give you a `game-source.zip` that contains all the files the server needs to run.

Now connect with WinSCP:

1. Open WinSCP and import your PuTTY session
    1. On the login dialog, click `Tools`
    2. Click `Import Sites`
    3. Tick your saved session and click `OK`, which brings the IP and your `.ppk` key across automatically
    - Or fill it in manually: protocol `SFTP`, your server's IP, port `22`, user `att`, and your key under `Private key file` (click `Advanced`, then `SSH`, then `Authentication` to find it)
2. Log in as `att`, not root (root can't log in anymore, that was the point). Enter your passphrase when asked if you added one
3. The right-hand pane is the server, starting in `/home/att`. Double-click into `att-server`
4. Drag `game-source.zip` from the left (your PC) into `att-server` and let it upload. This is the long part, go drink some water

Once its done uploading, switch back to PuTTY and run the below:

```bash
sudo apt install -y unzip
cd ~/att-server
unzip game-source.zip -d game-source
ls game-source
```

That `ls` needs to show `A Township Tale.exe`, `startServer.bat`, and `version.dll` directly. If it shows a single folder instead (like `game-source/game-source/...`), the zip had an extra folder level baked in. Fix it with:

```bash
mv game-source/game-source/* game-source/game-source/.[!.]* game-source/ 2>/dev/null; rmdir game-source/game-source
```

Once it looks right, delete the zip to get your ~4.4GB back:

```bash
rm game-source.zip
```

## Starting the server

The moment of truth:

```bash
cd ~/att-server
docker compose up -d
docker compose logs -f
```

The first start is slow, and that's normal: Docker pulls the image, then the container copies the entire game from `game-source` into its internal volume ("Syncing game files, this might take a few minutes"), then Wine builds its prefix, and only then does the game boot. Watch the logs roll by. Every start after this one skips all of that and is much faster. Press `Ctrl+C` to stop watching the logs once you're happy it's started. This does not stop the server, it keeps running in the background because of the `-d` we added when starting it.

Your day-to-day toolkit from here is as follows:

```bash
docker compose logs -f     # watch the server logs
docker compose ps          # is it running?
docker compose restart     # restart the server
docker compose down        # stop the server
docker compose up -d       # start it again
```

Your world saves and settings live in `~/att-server/server-data` on the VPS, and that's the folder to back up. Updating the game files or mods later works exactly as described in [the README](../README.md#updating-game-files-or-mods): drop the new files into `game-source` (via WinSCP), then stop the server, `docker compose run --rm a-township-container sync`, and start again. And per the README's disk-space note, once the first sync has completed you can delete the game files out of `game-source` to keep only one copy on disk.

Give it a minute or two after the logs settle, then try connecting to the game using your server's IP.

Players will need a Custom Server connection file pointing at your server's IP to actually join. Use the [encode/decode tool](https://chatonishere.github.io/a-township-container/) to generate one in your browser.

## Troubleshooting

Things get a little technical from here on out, so I don't blame you if you start pinging people for help.

**I'm locked out of SSH.**
Use your host's web console (in Hetzner's panel it's the `>_` `Console` button). It's a screen-and-keyboard connection that doesn't go through SSH at all. Log in as `att` with the password you set in `adduser`, then `sudo nano` whatever you broke (usually `/etc/ssh/sshd_config.d/00-hardening.conf` or a missing UFW rule) and `sudo systemctl restart ssh`.

**"Permission denied (publickey)" when connecting.**
In order of likelihood:

- You're connecting as the wrong user (use `att`)
- Your `authorized_keys` content is wrong. It needs to be the single `ssh-` line from PuTTYgen's copy box, not the contents of a `Save public key` file (that button produces a format Linux rejects)
- The `chown`/`chmod` lines from the user section got skipped. SSH refuses to use keys in folders it considers too open

**Password login still works after the lockdown section.**
Your config file is sorting after another one. Check with `sudo sshd -T | grep -i passwordauthentication`. If it says `yes`, look in `/etc/ssh/sshd_config.d/` for a file like `50-cloud-init.conf` setting it, and make sure your file's name sorts before it (that's the whole `00-` thing). Restart ssh after changing.

**`apt` says "Waiting for cache lock / Could not get lock".**
Ubuntu's automatic updater is running, usually right after a boot. It sorts itself out, just wait a few minutes and retry. Don't go deleting lock files by hand.

**A pink screen appears during `apt upgrade` asking about restarting services.**
That's Ubuntu's `needrestart` tool being chatty. Press Enter to accept the defaults and it carries on.

**`docker: permission denied while trying to connect to the Docker daemon socket`.**
Your session is older than the group change from the Docker section. Log out of PuTTY and back in. If it persists, run `groups` and check that `docker` is in the list.

**The container exits with "A Township Tale.exe executable is missing, preventing sync".**
The container can't find the game at the root of `game-source`, which is almost always the nested-folder problem from the upload section. `ls ~/att-server/game-source` needs to show the exe directly, not another folder.

**The container starts but keeps restarting, or the logs show authentication errors.**
Run `docker compose logs` and read the tail. The usual suspects are the tokens: a copy-paste that grabbed a trailing space or quote, values wrapped in quotes in `.env`, or expired tokens (grab fresh ones from `server.bat` and `docker compose up -d` again).

**My `.env` looks right but the tokens still don't work, and I made the file on Windows.**
Windows ends its lines with an invisible extra character (`\r`) that becomes part of the token when Linux reads the file. Recreate the file on the server with nano, or run `sed -i 's/\r$//' .env` to strip them, then `docker compose up -d` again.

**The server runs but nobody can connect from the game.**
Work through these in order:

1. **Host-level firewall.** This is the big one. Hetzner Cloud Firewalls, AWS security groups, Oracle Cloud (which blocks nearly everything by default), Azure NSGs... these sit in front of your VPS and UFW never even sees the traffic they drop. Open `1757` and `1761`, both TCP and UDP, in your host's control panel firewall too, or confirm no such firewall is attached to your server
2. **Is it actually listening?** `docker compose ps` should show the container as `Up` (not `Restarting`), and `sudo ss -ulpn | grep 1757` should show a listener
3. **Port mismatch.** If you set `SERVER_PORT` in `.env`, your UFW rules and host firewall need to match it

**`ufw status` doesn't mention my game ports but they're reachable anyway.**
Not a bug: Docker publishes container ports by writing its own firewall rules directly, bypassing UFW. The UFW rules still matter for everything non-Docker (like SSH), just be aware that UFW can't block a port Docker publishes. Don't publish container ports you don't want public (this compose file only publishes the game ports, so you're fine).

**The server randomly dies after running for a while, logs just stop.**
On a 4GB box this is usually Linux's out-of-memory killer. Fresh cloud images have no swap, so try adding 2GB as a cushion:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

You can confirm OOM kills with `sudo dmesg | grep -i "out of memory"`.

**Disk full (`no space left on device`).**
`df -h` shows what's using what. Quick wins: delete `game-source.zip` if it's still hanging around, clear the game files out of `game-source` after the first sync (see the README's disk-space section, saves you ~4.4GB), and `docker image prune -f` to drop superseded image versions after updates.

**The first start has been "Syncing game files" for ages.**
A few minutes is normal, it's copying ~4.4GB. The slowest VPS disks take a while longer. It only ever happens on the first start (or a manual `sync`).
