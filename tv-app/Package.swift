// swift-tools-version:5.9
// Builds only the platform-free logic so it can be tested with `swift test` on
// any Mac or Linux box:
//   SingoCore     FamilyGameNight/Singo/Core      Singo Night's rules
//   GameNightCore FamilyGameNight/GameNight/Core + FamilyGameNight/Feud/Core  what the TV display reads from the server
//                 (Family Feud keeps its own logic in the Feud folder)
// The tvOS app itself is built from FamilyGameNight.xcodeproj.
import PackageDescription

let package = Package(
    name: "FamilyGameNightCore",
    products: [
        .library(name: "SingoCore", targets: ["SingoCore"]),
        .library(name: "GameNightCore", targets: ["GameNightCore"]),
    ],
    targets: [
        .target(name: "SingoCore", path: "FamilyGameNight/Singo/Core"),
        .testTarget(name: "SingoCoreTests", dependencies: ["SingoCore"], path: "Tests/SingoCoreTests"),
        .target(name: "GameNightCore", path: "FamilyGameNight", sources: ["GameNight/Core", "Feud/Core"]),
        .testTarget(
            name: "GameNightCoreTests",
            dependencies: ["GameNightCore"],
            path: "Tests/GameNightCoreTests",
            exclude: ["Fixtures"]
        ),
    ]
)
