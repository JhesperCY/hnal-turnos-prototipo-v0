import json
import socket
import sys
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
ARCHIVO_ESTADO = RAIZ / "estado.json"
CANDADO = threading.Lock()

def cargar_estado():
    if ARCHIVO_ESTADO.exists():
        try:
            return json.loads(ARCHIVO_ESTADO.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}

def guardar_estado(estado):
    ARCHIVO_ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=2), encoding="utf-8")

ESTADO = cargar_estado()

class Handler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(RAIZ), **kwargs)

    def _responder_json(self, datos, codigo=200):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        if self.path == "/api/estado":
            with CANDADO:
                self._responder_json(ESTADO)
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/estado/"):
            clave = self.path[len("/api/estado/"):]
            largo = int(self.headers.get("Content-Length", 0))
            crudo = self.rfile.read(largo) if largo else b"null"
            try:
                valor = json.loads(crudo.decode("utf-8"))
            except json.JSONDecodeError:
                self._responder_json({"error": "JSON inválido"}, 400)
                return
            with CANDADO:
                ESTADO[clave] = valor
                guardar_estado(ESTADO)
            self._responder_json({"ok": True})
            return
        self._responder_json({"error": "Ruta no encontrada"}, 404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, formato, *args):
        print(f"[{self.address_string()}] {formato % args}")

def obtener_ip_local():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()

if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    servidor = ThreadingHTTPServer(("0.0.0.0", puerto), Handler)
    ip = obtener_ip_local()
    print("=" * 62)
    print(" Sistema de Gestión de Turnos - HNAL - Servidor central")
    print("=" * 62)
    print(f" En esta misma PC   -> http://localhost:{puerto}/")
    print(f" Desde otras PCs    -> http://{ip}:{puerto}/")
    print(f"   Login:  http://{ip}:{puerto}/pages/login.html")
    print(f"   TV:     http://{ip}:{puerto}/pages/tv.html")
    print(" (todas las demás PCs deben estar en la misma red/Wi-Fi)")
    print(" Presiona Ctrl+C para detener el servidor.")
    print("=" * 62)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
