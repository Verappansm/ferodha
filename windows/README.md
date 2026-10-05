# windows

A split setup: the services and the trading UI (http://localhost:4200) run
natively on Windows and Kafka runs in Docker on a Linux machine. Pass
`-SkipUi` to `start-windows.ps1` to leave the UI out.

```powershell
powershell -ExecutionPolicy Bypass -File windows\start-windows.ps1   # Windows
```
```bash
bash windows/kafka-linux.sh      # Linux
bash windows/test-windows.sh     # Windows, Git Bash
```

The full step-by-step guide and troubleshooting are in
`windows-setup.md`, in this folder.
