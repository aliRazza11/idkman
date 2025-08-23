"""init db

Revision ID: e4b16bcf0efd
Revises: 
Create Date: 2025-08-21 18:57:21.585373

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4b16bcf0efd'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Create users table
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(255), nullable=False, index=True),
        sa.Column("email", sa.String(255), unique=True, index=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
    )

    # Create images table
    op.create_table(
        "images",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("image_data", sa.LargeBinary(length=(2**24-1)), nullable=False),  # <-- BLOB
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("images")
    op.drop_table("users")