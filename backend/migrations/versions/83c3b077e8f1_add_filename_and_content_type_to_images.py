"""Add filename and content_type to images

Revision ID: 83c3b077e8f1
Revises: e4b16bcf0efd
Create Date: 2025-08-23 17:03:39.646233

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '83c3b077e8f1'
down_revision: Union[str, Sequence[str], None] = 'e4b16bcf0efd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    op.add_column('images', sa.Column('filename', sa.String(length=255), nullable=False, server_default='upload'))
    op.add_column('images', sa.Column('content_type', sa.String(length=100), nullable=False, server_default='application/octet-stream'))


def downgrade() -> None:
    op.drop_column('images', 'content_type')
    op.drop_column('images', 'filename')
