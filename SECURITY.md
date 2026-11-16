# Security

Please report vulnerabilities privately with **Report a vulnerability** on this repository's Security tab, not
in a public issue. You'll get a reply within a few days.

Codual UI is a library that runs inside your app, on SwiftUI and React Native. It makes no network requests of its
own, stores nothing and collects nothing: the data it shows comes from the code your app passes in. These are bugs
worth reporting:

- A behaviour that sends, stores or logs your app's data
- A behaviour that shows one load's data in place of another's, such as after the user signs out
- A purchase unlocked without a verified transaction, once purchases ship
