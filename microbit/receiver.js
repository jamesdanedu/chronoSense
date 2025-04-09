// Handler for received radio messages
radio.onReceivedString(function (receivedString) {
    // Pass the data directly to the serial port
    serial.writeLine(receivedString)
    // Show a dot in the center to indicate data received
    led.plot(2, 2)
    basic.pause(200)
    led.unplot(2, 2)
    // Update the last received time
    lastReceivedTime = input.runningTime()
})
let lastReceivedTime = 0
let RadioGroupID = 136  // Change as required
// Initialize radio and serial communication
radio.setGroup(RadioGroupID)
radio.setTransmitPower(7)
serial.redirectToUSB()
serial.setBaudRate(115200)
basic.showNumber(RadioGroupID)
basic.pause(5000)
// Show a startup icon to indicate receiver is ready
basic.showIcon(IconNames.Target)
// Check if we're still receiving data (every 5 seconds)
basic.forever(function () {
    // If no data received for more than 15 seconds, show warning
    if (input.runningTime() - lastReceivedTime > 15000 && lastReceivedTime > 0) {
        basic.showIcon(IconNames.Sad)
        basic.pause(500)
        basic.showIcon(IconNames.Target)
    }
    basic.pause(5000)
})
