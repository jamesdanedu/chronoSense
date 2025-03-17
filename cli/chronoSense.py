#############################################################
# chronoSense.py
# 
# 14-Mar-2025   Created         James O'Sullivan
# 18-Mar-2025   Added retries   James O'Sullivan
#

import serial
import datetime
import time
import argparse
import csv
import os
import sys
import signal
import logging
from pathlib import Path

# Set up logging with custom date format (DD-MM-YYYY)
logging_handler = logging.StreamHandler(sys.stdout)
logging_handler.setFormatter(
    logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', 
                      datefmt='%d-%m-%Y %H:%M:%S')
)

logger = logging.getLogger('ChronoSense')
logger.setLevel(logging.INFO)
logger.addHandler(logging_handler)
# Prevent the root logger from duplicating messages
logger.propagate = False

class MicrobitDataLogger:
    def __init__(self, port=None, baud_rate=115200, log_dir='logs', log_prefix='microbit_data', max_retries=5):
        self.port = port
        self.baud_rate = baud_rate
        self.log_dir = log_dir
        self.log_prefix = log_prefix
        self.serial_connection = None
        self.csv_writer = None
        self.csv_file = None
        self.data_count = 0
        self.running = False
        self.log_filename = None
        self.field_names = ['timestamp']
        self.max_retries = max_retries
        
        # Create logs directory if it doesn't exist
        Path(log_dir).mkdir(exist_ok=True)
    
    def find_microbit_port(self):
        """Try to automatically find the Microbit serial port"""
        import serial.tools.list_ports
        
        ports = list(serial.tools.list_ports.comports())
        for port in ports:
            # Look for common Microbit identifiers
            if "mbed" in port.description.lower() or "microbit" in port.description.lower():
                return port.device
            
        return None
    
    def connect(self):
        """Connect to the Microbit with retries"""
        if not self.port:
            # Try to auto-detect the port with retries
            retry_count = 0
            while retry_count < self.max_retries:
                logger.info(f"Looking for Microbit... (attempt {retry_count + 1}/{self.max_retries})")
                self.port = self.find_microbit_port()
                
                if self.port:
                    logger.info(f"Microbit found on port {self.port}")
                    break
                
                retry_count += 1
                if retry_count < self.max_retries:
                    logger.info(f"Microbit not found. Retrying in 2 seconds...")
                    time.sleep(2)  # Wait before retrying
            
            if not self.port:
                available_ports = list(serial.tools.list_ports.comports())
                if available_ports:
                    port_list = "\n".join([f"  - {p.device}: {p.description}" for p in available_ports])
                    logger.error(f"Microbit not found after {self.max_retries} attempts. Available ports:\n{port_list}")
                else:
                    logger.error(f"No serial ports found after {self.max_retries} attempts. Is the Microbit connected?")
                return False
        
        try:
            logger.info(f"Connecting to Microbit on port {self.port} at {self.baud_rate} baud...")
            self.serial_connection = serial.Serial(self.port, self.baud_rate, timeout=1)
            logger.info("Connected successfully!")
            return True
        except serial.SerialException as e:
            logger.error(f"Failed to connect: {str(e)}")
            return False
    
    def disconnect(self):
        """Disconnect from the Microbit"""
        if self.serial_connection and self.serial_connection.is_open:
            self.serial_connection.close()
            logger.info("Disconnected from Microbit")
    
    def setup_log_file(self):
        """Create a new log file with timestamp in filename"""
        # Use DD-MM-YYYY format for the log filename
        timestamp = datetime.datetime.now().strftime("%d-%m-%Y_%H%M%S")
        self.log_filename = os.path.join(self.log_dir, f"{self.log_prefix}_{timestamp}.csv")
        
        try:
            self.csv_file = open(self.log_filename, 'w', newline='')
            self.csv_writer = csv.writer(self.csv_file)
            # Write header row - will be updated with actual field names when data is received
            self.csv_writer.writerow(self.field_names)
            self.csv_file.flush()
            logger.info(f"Logging data to {self.log_filename}")
            return True
        except IOError as e:
            logger.error(f"Failed to create log file: {str(e)}")
            return False
    
    def update_field_names(self, values):
        """Update field names based on incoming data"""
        old_field_names = self.field_names.copy()
        
        # Generate field names for the values (field1, field2, etc.)
        data_fields = [f"field{i+1}" for i in range(len(values))]
        new_field_names = ['timestamp'] + data_fields
        
        # Only update if field names have changed
        if new_field_names != old_field_names:
            self.field_names = new_field_names
            
            # If we've already started logging, we need to:
            # 1. Close the current file
            # 2. Create a new file with the updated headers
            # 3. Copy the old data to the new file
            if self.csv_file and self.data_count > 0:
                logger.info("Data format changed, updating log file headers...")
                
                # Close current file
                old_filename = self.log_filename
                self.csv_file.close()
                
                # Read existing data
                with open(old_filename, 'r') as old_file:
                    old_reader = csv.reader(old_file)
                    old_data = list(old_reader)[1:]  # Skip the header row
                
                # Create new file
                self.setup_log_file()
                
                # Write the old data to the new file
                for row in old_data:
                    # Pad the row if necessary to match the new field count
                    padded_row = row + [''] * (len(self.field_names) - len(row))
                    # Truncate if the new format has fewer fields
                    padded_row = padded_row[:len(self.field_names)]
                    self.csv_writer.writerow(padded_row)
                
                # Delete the old file
                os.remove(old_filename)
                logger.info(f"Log file updated with new fields: {', '.join(self.field_names)}")
            
            return True
        return False
    
    def process_data(self, line):
        """Process a line of data from the Microbit"""
        try:
            # Split comma-separated values
            values = line.strip().split(',')
            
            # Update field names if necessary
            self.update_field_names(values)
            
            # Add timestamp in DD-MM-YYYY format
            now = datetime.datetime.now()
            timestamp = now.strftime("%d-%m-%Y %H:%M:%S.%f")[:-3]  # Include milliseconds
            row = [timestamp] + values
            
            # Write to CSV
            self.csv_writer.writerow(row)
            self.csv_file.flush()
            
            # Update counter and print status
            self.data_count += 1
            if self.data_count % 10 == 0:  # Print status every 10 records
                logger.info(f"Received {self.data_count} data points - Last values: {', '.join(values)}")
        
        except Exception as e:
            logger.error(f"Error processing data: {str(e)}")
    
    def start_logging(self):
        """Start logging data from the Microbit"""
        if not self.connect():
            return False
        
        if not self.setup_log_file():
            self.disconnect()
            return False
        
        self.running = True
        self.data_count = 0
        
        try:
            # Clear any pending data
            self.serial_connection.reset_input_buffer()
            
            # Main loop
            logger.info("Waiting for data from Microbit...")
            buffer = ""
            
            while self.running:
                if self.serial_connection.in_waiting > 0:
                    # Read data, decode bytes to string
                    byte_data = self.serial_connection.read(self.serial_connection.in_waiting)
                    text_data = byte_data.decode('utf-8', errors='replace')
                    
                    # Add to buffer and process complete lines
                    buffer += text_data
                    while '\n' in buffer:
                        line, buffer = buffer.split('\n', 1)
                        if line.strip():  # Skip empty lines
                            self.process_data(line)
                
                # Small delay to prevent high CPU usage
                time.sleep(0.01)
        
        except KeyboardInterrupt:
            logger.info("Logging stopped by user")
        except Exception as e:
            logger.error(f"Error during logging: {str(e)}")
        finally:
            self.running = False
            if self.csv_file:
                self.csv_file.close()
                logger.info(f"Log file saved: {self.log_filename}")
            self.disconnect()
            return True
    
    def stop_logging(self):
        """Stop the logging process"""
        self.running = False

def signal_handler(sig, frame):
    """Handle Ctrl+C gracefully"""
    logger.info("Shutdown signal received, stopping...")
    if logger.data_logger and logger.data_logger.running:
        logger.data_logger.stop_logging()
    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description='ChronoSense - Microbit Data Logger')
    parser.add_argument('--port', '-p', help='Serial port for the Microbit')
    parser.add_argument('--baud', '-b', type=int, default=115200, help='Baud rate (default: 115200)')
    parser.add_argument('--log-dir', '-d', default='logs', help='Directory to store log files (default: logs)')
    parser.add_argument('--prefix', '-f', default='microbit_data', help='Prefix for log filenames (default: microbit_data)')
    parser.add_argument('--retries', '-r', type=int, default=5, help='Maximum number of connection retries (default: 5)')
    
    args = parser.parse_args()
    
    # Set up signal handling for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    
    # Create and start the logger
    data_logger = MicrobitDataLogger(
        port=args.port,
        baud_rate=args.baud,
        log_dir=args.log_dir,
        log_prefix=args.prefix,
        max_retries=args.retries
    )
    
    # Store reference to logger in signal handler
    logger.data_logger = data_logger
    
    # Print banner
    print("\n" + "="*60)
    print("    ChronoSense - Microbit Data Logger")
    print("    Press Ctrl+C to stop logging")
    print("="*60 + "\n")
    
    # Start logging
    data_logger.start_logging()

if __name__ == "__main__":
    main()