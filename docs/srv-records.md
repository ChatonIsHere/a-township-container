# Ports and SRV records

A server uses four ports. Players never type any of them.

| Setting | Default | Protocol | For |
| --- | --- | --- | --- |
| `SERVER_PORT` | 1757 | UDP | The game |
| `RCON_PORT` | 1760 | TCP | The console. Keep it closed to the internet unless you use TavernLauncher's Remote Console |
| `WEB_PORT` | 1761 | TCP | The game's web server, which players load the forest from |
| `AUTH_PORT` | 1762 | TCP | TavernLib's login |

The container writes these into `tavern_server.json`. Moving the console, web and login ports needs a TavernLib with SRV support; an older one only follows `SERVER_PORT`.

## How players find them

A player's launcher only has to find the login port. The login replies carry the game and web ports.

- A server on the default ports needs nothing new. Players type its IP or name as before.
- A server on other ports gets an SRV record, like Minecraft's `_minecraft._tcp`, pointing at its login port:

```
box.example.com.                       A    203.0.113.5
_townshiptale._tcp.play.example.com.   SRV  0 5 27016 box.example.com.
```

Players type `play.example.com`. In a DNS panel the record is:

| Field | Value |
| --- | --- |
| Name | `_townshiptale._tcp.play` |
| Priority | 0 |
| Weight | 5 |
| Port | the login port, `27016` here |
| Target | `box.example.com` |

## Two servers on one machine

Give each its own four ports and its own record:

```
# .env for the second server
SERVER_PORT=27015
RCON_PORT=27018
WEB_PORT=27017
AUTH_PORT=27016
```

```
_townshiptale._tcp.main.example.com.   SRV  0 5 1762  box.example.com.
_townshiptale._tcp.event.example.com.  SRV  0 5 27016 box.example.com.
```
