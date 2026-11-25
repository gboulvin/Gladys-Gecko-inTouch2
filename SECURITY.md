# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys, and the spa controller
  platform shown in the logs (e.g. `inyt C87/S83`);
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes —
including how it parses the datagrams it receives from the local network and
what it lets a Gladys user or scene send to the spa.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the Gecko controllers and the in.touch2 module firmware (report those to Gecko
Alliance).

Good to know: the in.touch2 local protocol has no authentication nor
encryption — any device of the local network can drive the spa, with or
without this integration. Keep the module on a trusted network (or a
dedicated IoT VLAN reachable by Gladys).
