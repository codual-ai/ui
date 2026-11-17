// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "CodualUI",
  platforms: [.iOS(.v17)],
  products: [
    .library(name: "CodualUI", targets: ["CodualUI"])
  ],
  targets: [
    .target(name: "CodualUI"),
    .testTarget(name: "CodualUITests", dependencies: ["CodualUI"]),
    // StoreKit Testing in a test bundle of its own, so its session never holds up the other suites' main actor.
    .testTarget(
      name: "CodualUIStoreKitTests", dependencies: ["CodualUI"], resources: [.copy("Products.storekit")]),
  ]
)
