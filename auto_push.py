"""
auto_push.py - Monitora o projeto e faz push automatico para o GitHub
Repositorio: tony-nexus/eduOS
Pasta:       C:/Projetos/HLV_edu-main

Uso:
    python auto_push.py

Instale a dependencia antes:
    pip install watchdog
"""

import subprocess
import time
import logging
from pathlib import Path
from datetime import datetime

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

# -- Configuracoes -----------------------------------------------------------
PROJECT_DIR = Path("C:/Projetos/HLV_edu-main")
DEBOUNCE_SECONDS = 3          # aguarda X segundos sem novas mudancas antes de commitar
BRANCH = "main"               # branch de destino no GitHub
LOG_FILE = PROJECT_DIR / "auto_push.log"

# Pastas e extensoes ignoradas
IGNORED_DIRS = {".git", "__pycache__", ".venv", "venv", "node_modules", ".idea", ".vscode"}
IGNORED_EXTENSIONS = {".pyc", ".pyo", ".log", ".tmp"}
# ----------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)


def run(cmd):
    """Executa um comando git e retorna (codigo, stdout, stderr)."""
    result = subprocess.run(
        cmd,
        cwd=PROJECT_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def has_changes():
    """Retorna True se houver arquivos modificados/novos no repositorio."""
    code, out, _ = run(["git", "status", "--porcelain"])
    return bool(out)


def commit_and_push():
    """Faz git add, commit e push. Registra no log."""
    if not has_changes():
        log.info("Nenhuma mudanca detectada - push ignorado.")
        return

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    msg = f"auto: atualizacao automatica em {timestamp}"

    # git add -A
    code, out, err = run(["git", "add", "-A"])
    if code != 0:
        log.error(f"git add falhou: {err}")
        return

    # git commit
    code, out, err = run(["git", "commit", "-m", msg])
    if code != 0:
        log.error(f"git commit falhou: {err}")
        return
    log.info(f"Commit criado: {msg}")

    # git push
    code, out, err = run(["git", "push", "origin", BRANCH])
    if code != 0:
        log.error(f"git push falhou: {err}")
        return

    log.info(f"Push realizado com sucesso -> origin/{BRANCH}")


def should_ignore(path):
    """Verifica se o arquivo/pasta deve ser ignorado."""
    p = Path(path)
    if any(part in IGNORED_DIRS for part in p.parts):
        return True
    if p.suffix.lower() in IGNORED_EXTENSIONS:
        return True
    return False


class ChangeHandler(FileSystemEventHandler):
    """Detecta qualquer mudanca no sistema de arquivos e agenda um push."""

    def __init__(self):
        self._pending = False
        self._last_event = 0.0

    def _schedule(self, path):
        if should_ignore(path):
            return
        log.info(f"Mudanca detectada: {path}")
        self._last_event = time.monotonic()
        self._pending = True

    def on_modified(self, event):
        if not event.is_directory:
            self._schedule(event.src_path)

    def on_created(self, event):
        self._schedule(event.src_path)

    def on_deleted(self, event):
        self._schedule(event.src_path)

    def on_moved(self, event):
        self._schedule(event.dest_path)

    def check_and_push(self):
        """Chamado no loop principal: faz push se o debounce expirou."""
        if self._pending:
            elapsed = time.monotonic() - self._last_event
            if elapsed >= DEBOUNCE_SECONDS:
                self._pending = False
                commit_and_push()


def main():
    if not PROJECT_DIR.exists():
        log.error(f"Pasta nao encontrada: {PROJECT_DIR}")
        return

    if not (PROJECT_DIR / ".git").exists():
        log.error("A pasta nao e um repositorio Git. Execute 'git init' primeiro.")
        return

    log.info(f"Monitorando: {PROJECT_DIR}")
    log.info(f"Branch de destino: {BRANCH}")
    log.info(f"Debounce: {DEBOUNCE_SECONDS}s | Ctrl+C para parar\n")

    handler = ChangeHandler()
    observer = Observer()
    observer.schedule(handler, str(PROJECT_DIR), recursive=True)
    observer.start()

    try:
        while True:
            handler.check_and_push()
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Monitoramento encerrado pelo usuario.")
    finally:
        observer.stop()
        observer.join()


if __name__ == "__main__":
    main()
