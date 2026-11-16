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
  ]
)
