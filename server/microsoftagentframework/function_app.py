"""
Microsoft Agent Framework — Azure Functions (Python v2) エントリポイント。

5つのエージェントパターンを Blueprint として登録する。
現時点では Sequential のみ実装済み（他は今後追加）。
"""

import azure.functions as func

from patterns.sequential import bp as sequential_bp
from patterns.concurrent import bp as concurrent_bp
from patterns.handoff import bp as handoff_bp
from patterns.group_chat import bp as group_chat_bp

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# 実装済みパターンを登録
app.register_blueprint(sequential_bp)
app.register_blueprint(concurrent_bp)
app.register_blueprint(handoff_bp)
app.register_blueprint(group_chat_bp)

# 実装時に追加していく:
# from patterns.magentic import bp as magentic_bp
# app.register_blueprint(magentic_bp)
