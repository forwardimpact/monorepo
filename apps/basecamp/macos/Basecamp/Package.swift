// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "Basecamp",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "Basecamp",
            path: "Sources"
        ),
    ]
)
