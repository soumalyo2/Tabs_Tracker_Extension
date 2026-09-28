from datetime import datetime, timezone, timedelta
import sqlite3
from config import DATABASE_PATH, IDLE_TIMEOUT_SECONDS
from database import db_connection
import uuid

class SessionModel:
    def __init__(self, session_id, created_at, last_active, is_active=1):
        self.session_id = session_id
        self.created_at = created_at
        self.last_active = last_active
        self.is_active = is_active

    @staticmethod
    def create_session():
        """Generates a secure UUID key and logs a new active session."""
        new_session_id = str(uuid.uuid4())
        current_time_str = datetime.now(timezone.utc).isoformat()
        with db_connection() as conn:
            cursor = conn.cursor()
            # Deactivate any prior active sessions so only one remains active
            cursor.execute("UPDATE sessions SET is_active = 0 WHERE is_active = 1")
            cursor.execute(
                "INSERT INTO sessions (session_id, created_at, last_active, is_active) VALUES (?, ?, ?, 1)", 
                (new_session_id, current_time_str, current_time_str)
            )
            return new_session_id

    @staticmethod
    def get_session(session_id):
        """Fetches operational rows utilizing row_factory configuration flags."""
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,))
            row = cursor.fetchone()
            if row:
                return SessionModel(
                    session_id=row['session_id'],
                    created_at=row['created_at'],
                    last_active=row['last_active'],
                    is_active=row['is_active']
                )
            return None

    @staticmethod
    def get_active_session_id():
        """Returns the session_id of the currently active session, if any."""
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT session_id FROM sessions WHERE is_active = 1 ORDER BY last_active DESC LIMIT 1")
            row = cursor.fetchone()
            return row['session_id'] if row else None

    @staticmethod
    def get_or_create_active_session():
        """Checks for an active session, checks idle timeout, and rolls or spawns one."""
        SessionModel.deactivate_expired_sessions()
        active_id = SessionModel.get_active_session_id()
        if active_id:
            SessionModel.update_last_active(active_id)
            return active_id
        return SessionModel.create_session()

    @staticmethod
    def update_last_active(session_id):
        """Updates the monitoring heartbeat timestamp to track active presence."""
        current_time_str = datetime.now(timezone.utc).isoformat()
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE sessions SET last_active = ?, is_active = 1 WHERE session_id = ?", (current_time_str, session_id))

    @staticmethod
    def deactivate_expired_sessions():
        """Flips expired sessions to inactive state if idle timeout has passed."""
        cutoff_time = datetime.now(timezone.utc) - timedelta(seconds=IDLE_TIMEOUT_SECONDS)
        cutoff_str = cutoff_time.isoformat()
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE sessions SET is_active = 0 WHERE last_active < ? AND is_active = 1", 
                (cutoff_str,)
            )

    @staticmethod
    def delete_session(session_id):
        """Deletes a specific session. Cascades to tabs table via ON DELETE CASCADE."""
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))

    @staticmethod
    def clear_all_records():
        """Wipes all tracking sessions and cascading tabs completely."""
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM sessions")

class TabModel:
    def __init__(self, id, session_id, url, title, fav_icon_url, visit_count, first_visited, last_visited):
        self.id = id
        self.session_id = session_id
        self.url = url
        self.title = title
        self.fav_icon_url = fav_icon_url
        self.visit_count = visit_count
        self.first_visited = first_visited
        self.last_visited = last_visited

    @staticmethod
    def upsert_tab(session_id, url, title, fav_icon_url=None):
        """
        Executes an Upsert strategy: inserts a new tab or increments visit_count and updates last_visited.
        """
        current_time_str = datetime.now(timezone.utc).isoformat()
        with db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO tabs (session_id, url, title, fav_icon_url, first_visited, last_visited)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id, url) DO UPDATE SET
                    visit_count = visit_count + 1,
                    title = excluded.title,
                    fav_icon_url = CASE
                        WHEN excluded.fav_icon_url IS NOT NULL AND excluded.fav_icon_url != ''
                        THEN excluded.fav_icon_url
                        ELSE tabs.fav_icon_url
                    END,
                    last_visited = excluded.last_visited
            """, (session_id, url, title, fav_icon_url, current_time_str, current_time_str))

    @staticmethod
    def fetch_history_grouped():
        """
        Pulls all sessions ordered by creation date and groups tabs under their session IDs.
        """
        with db_connection() as conn:
            cursor = conn.cursor()

            
            cursor.execute("""
                SELECT session_id, created_at, last_active, is_active
                FROM sessions
                ORDER BY created_at DESC
            """)
            session_rows = cursor.fetchall()

            sessions_map = {}
            for s in session_rows:
                sessions_map[s['session_id']] = []

            
            cursor.execute("""
                SELECT session_id, url, title, fav_icon_url, visit_count, last_visited
                FROM tabs
                ORDER BY last_visited DESC
            """)
            tab_rows = cursor.fetchall()

            for row in tab_rows:
                sid = row['session_id']
                if sid in sessions_map:
                    sessions_map[sid].append({
                        "url": row['url'],
                        "title": row['title'] or row['url'],
                        "fav_icon_url": row['fav_icon_url'] or "",
                        "visits": row['visit_count'],
                        "time": row['last_visited']
                    })

            return sessions_map