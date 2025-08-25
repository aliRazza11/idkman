import psutil
import sys

PORT = 8000

def kill_process_on_port(port: int):
    found = False
    for conn in psutil.net_connections(kind="inet"):
        if conn.laddr.port == port:
            pid = conn.pid
            if pid:
                try:
                    proc = psutil.Process(pid)
                    print(f"Killing PID {pid} ({proc.name()}) on port {port}")
                    proc.kill()
                    found = True
                except Exception as e:
                    print(f"Could not kill PID {pid}: {e}")
    if not found:
        print(f"No process found on port {port}")

if __name__ == "__main__":
    try:
        kill_process_on_port(PORT)
    except KeyboardInterrupt:
        sys.exit(0)
