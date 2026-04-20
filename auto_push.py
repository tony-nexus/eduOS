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
import threading
from pathlib import Path
from datetime import datetime

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

# -- Configuracoes -----------------------------------------------------------
PROJECT_DIR = Path("C:/Projetos/HLV_edu-main")
DEBOUNCE_SECONDS = 3          # aguarda X segundos sem novas mudancas antes de commitar
LOG_FILE = PROJECT_DIR / "auto_push.log"

# Pastas ignoradas
IGNORED_DIRS = {".git", "__pycache__", ".venv", "venv", "node_modules", ".idea", ".vscode"}
# Extensoes ignoradas
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

# Mutex para garantir apenas um git push por vez
_git_lock = threading.Lock()


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


def get_current_branch():
    """Detecta o branch local atual."""
    code, out, _ = run(["git", "branch", "--show-current"])
    if code == 0 and out:
        return out.strip()
    # Fallback para versoes antigas do git
    code, out, _ = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    return out.strip() if code == 0 and out else "main"


def remove_lock_if_stale():
    """Remove .git/index.lock se estiver travado sem processo ativo."""
    lock = PROJECT_DIR / ".git" / "index.lock"
    if lock.exists():
        lock.unlink(missing_ok=True)
        log.warning("index.lock removido (processo anterior travado).")


def has_changes():
    """Retorna True se houver arquivos modificados/novos no repositorio."""
    code, out, _ = run(["git", "status", "--porcelain"])
    return bool(out)


def commit_and_push():
    """Faz git add, commit e push. Usa lock para evitar concorrencia."""
    if not _git_lock.acquire(blocking=False):
        return  # outra operacao git em andamento, ignora

    try:
        if not has_changes():
            log.info("Nenhuma mudanca detectada - push ignorado.")
            return

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        msg = f"auto: atualizacao automatica em {timestamp}"

        # git add -A
        code, out, err = run(["git", "add", "-A"])
        if code != 0:
            if "index.lock" in err:
                remove_lock_if_stale()
                run(["git", "add", "-A"])  # tenta de novo
            else:
                log.error(f"git add falhou: {err}")
                return

        # git commit
        code, out, err = run(["git", "commit", "-m", msg])
        if code != 0:
            log.error(f"git commit falhou: {err}")
            return
        log.info(f"Commit criado: {msg}")

        # Detecta branch atual a cada push (usuario pode ter trocado)
        branch = get_current_branch()

        # git push
        code, out, err = run(["git", "push", "origin", branch])
        if code != 0:
            log.error(f"git push falhou: {err}")
            return

        log.info(f"Push realizado com sucesso -> origin/{branch}")

    finally:
        _git_lock.release()


def should_ignore(path):
    """Verifica se o arquivo/pasta deve ser ignorado."""
    p = Path(path)

    # Ignora pastas especiais
    if any(part in IGNORED_DIRS for part in p.parts):
        return True

    name = p.name

    # Ignora o proprio log do script
    if name == LOG_FILE.name:
        return True

    # Ignora extensoes proibidas (.pyc, .log, etc.)
    if p.suffix.lower() in IGNORED_EXTENSIONS:
        return True

    # Ignora arquivos temporarios do editor (ex: alunos.js.tmp.27836.123456)
    if ".tmp." in name:
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
        if not event.is_directory:
            self._schedule(event.src_path)

    def on_deleted(self, event):
        if not event.is_directory:
            self._schedule(event.src_path)

    def on_moved(self, event):
        if not event.is_directory:
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

    branch = get_current_branch()
    log.info(f"Monitorando: {PROJECT_DIR}")
    log.info(f"Branch detectado: {branch}")
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
