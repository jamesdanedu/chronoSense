radio.setGroup(135)
radio.setTransmitPower(7)

// Calculate checksum using modSum approach
function calculateChecksum(value: number): number {
    // Extract ones digit of the value
    return Math.abs(Math.round(value)) % 10
}

// KY-025 Digital Output Code (JavaScript)
// Connect KY-025 DO to Microbit pin 1
basic.forever(function () {
    // Read sensor state (1 when magnet is present)
    let magnetState = pins.digitalReadPin(DigitalPin.P1)
    
    if (magnetState == 1) {
        basic.showLeds(`
            . . . . .
            . . . . .
            . . # . .
            . . . . .
            . . . . .
            `)
        
        // Calculate checksum for the magnet state
        let checksum = calculateChecksum(magnetState)
        
        // Send the data with the checksum appended (1,1)
        radio.sendString(convertToText(magnetState) + "," + convertToText(checksum))
    } else {
        // No magnet
        basic.showIcon(IconNames.No)
        
        // Calculate checksum for the magnet state (which is 0)
        let checksum = calculateChecksum(magnetState)
        
        // Send the data with the checksum appended (0,0)
        radio.sendString(convertToText(magnetState) + "," + convertToText(checksum))
    }
    
    basic.clearScreen()
    basic.pause(200)
})
