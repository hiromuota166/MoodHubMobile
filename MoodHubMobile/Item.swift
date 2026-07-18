//
//  Item.swift
//  MoodHubMobile
//
//  Created by 太田啓夢 on 2026/07/18.
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date
    
    init(timestamp: Date) {
        self.timestamp = timestamp
    }
}
