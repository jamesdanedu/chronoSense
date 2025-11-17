# SCD40/SCD41 Sensor
# Simplified code for students learning about sensors
# Measures CO2, Temperature, and Humidity
# Sends data to ChronoSense
#
# Hardware: Connect SCD40/SCD41 to micro:bit I2C pins
# VCC → 3V, GND → GND, SDA → Pin 20, SCL → Pin 19

from microbit import *
import radio

# Setup
radio.on()
radio.config(channel=144, power=7)

# Sensor I2C address
SENSOR = 0x62

# Start sensor
def start_sensor():
    i2c.write(SENSOR, bytes([0x21, 0xb1]))
    sleep(100)

# Read sensor
def read_sensor():
    try:
        # Ask for data
        i2c.write(SENSOR, bytes([0xec, 0x05]))
        sleep(1)
        
        # Read 9 bytes
        data = i2c.read(SENSOR, 9)
        
        # Get CO2 (bytes 0-1)
        co2 = (data[0] << 8) | data[1]
        
        # Get Temperature (bytes 3-4)
        temp_raw = (data[3] << 8) | data[4]
        temp = -45 + 175 * (temp_raw / 65536.0)
        
        # Get Humidity (bytes 6-7)
        hum_raw = (data[6] << 8) | data[7]
        humidity = 100 * (hum_raw / 65536.0)
        
        return co2, temp, humidity
    except:
        return None, None, None

# Calculate checksum
def checksum(co2, temp, humidity):
    total = abs(int(co2)) % 10 + abs(int(temp)) % 10 + abs(int(humidity)) % 10
    return total % 10

# Main program
display.show(Image.HEART)
start_sensor()
sleep(2000)
display.clear()

while True:
    # Read sensor
    co2, temp, humidity = read_sensor()
    
    if co2 is not None:
        # Calculate checksum
        check = checksum(co2, temp, humidity)
        
        # Send data: CO2,Temp,Humidity,Checksum
        message = "{},{},{},{}".format(
            int(co2),
            round(temp, 1),
            round(humidity, 1),
            check
        )
        radio.send(message)
        
        # Flash LED
        display.set_pixel(0, 0, 9)
        sleep(50)
        display.clear()
    
    # Wait 5 seconds
    sleep(5000)






