import ExpoModulesCore
import UIKit
import Vision

/// Reads the text off a photo on the phone, with each line's position, so a
/// nutrition table can be rebuilt row by row ("Protein (g) | 6.8 | 2.0").
/// Apple Vision: free, offline, and no photo leaves the device.
public class LabelOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LabelOcr")

    AsyncFunction("recognize") { (uri: URL) -> [[String: Any]] in
      let data = try Data(contentsOf: uri)
      guard let image = UIImage(data: data), let cgImage = image.cgImage else {
        throw Exception(name: "ERR_IMAGE", description: "Could not read the image")
      }

      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      // Language correction "fixes" digits and units into words (0g -> Og).
      request.usesLanguageCorrection = false

      let handler = VNImageRequestHandler(
        cgImage: cgImage,
        orientation: CGImagePropertyOrientation(image.imageOrientation),
        options: [:]
      )
      try handler.perform([request])

      return (request.results ?? []).compactMap { observation in
        guard let top = observation.topCandidates(1).first else { return nil }
        // Vision boxes are normalised with the origin bottom-left; the JS side
        // wants y from the top.
        let box = observation.boundingBox
        return [
          "text": top.string,
          "x": Double(box.minX),
          "y": Double(1 - box.maxY),
          "w": Double(box.width),
          "h": Double(box.height),
        ]
      }
    }
  }
}

extension CGImagePropertyOrientation {
  init(_ orientation: UIImage.Orientation) {
    switch orientation {
    case .up: self = .up
    case .upMirrored: self = .upMirrored
    case .down: self = .down
    case .downMirrored: self = .downMirrored
    case .left: self = .left
    case .leftMirrored: self = .leftMirrored
    case .right: self = .right
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}
