# Security

Please report vulnerabilities privately with **Report a vulnerability** on this repository's Security tab, not
in a public issue. You'll get a reply within a few days.

`codual-ui` runs on your machine and needs no network or account. These are bugs worth reporting:

- Writing anywhere other than the theme file you name and its preview page
- Replacing an existing file without `--force`
- A preview page that can run script or reach the network
- A brand file whose text ends up as code in the generated `Theme.swift`
