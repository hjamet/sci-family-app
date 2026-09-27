import os
import sys
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.database import get_db, SessionLocal
from app.models import DocumentCategory, AdminDocument

client = TestClient(app)

def test_document_categories_crud_endpoints():
    # 1. GET categories (auto-seed)
    get_res = client.get("/api/documents/categories")
    assert get_res.status_code == 200
    categories = get_res.json()
    assert len(categories) >= 6
    assert any(c["name"] == "Actes & Statuts" for c in categories)

    # 2. POST create category
    cat_payload = {
        "name": "Test Catégorie Temp",
        "emoji": "🧪",
        "color": "emerald"
    }
    create_res = client.post("/api/documents/categories", json=cat_payload)
    assert create_res.status_code == 201
    created = create_res.json()
    cat_id = created["id"]
    assert created["name"] == "Test Catégorie Temp"
    assert created["emoji"] == "🧪"
    assert created["color"] == "emerald"

    # 3. PUT update category & check cascade on documents
    db = SessionLocal()
    doc_test = AdminDocument(
        title="Doc Test Cascade",
        category="Test Catégorie Temp",
        file_url="https://example.com/test.pdf",
        uploaded_by="Henri"
    )
    db.add(doc_test)
    db.commit()
    db.refresh(doc_test)
    doc_id = doc_test.id
    db.close()

    update_payload = {
        "name": "Test Catégorie Renommée",
        "emoji": "🔬",
        "color": "purple"
    }
    put_res = client.put(f"/api/documents/categories/{cat_id}", json=update_payload)
    assert put_res.status_code == 200
    updated = put_res.json()
    assert updated["id"] == cat_id
    assert updated["name"] == "Test Catégorie Renommée"
    assert updated["emoji"] == "🔬"
    assert updated["color"] == "purple"

    db = SessionLocal()
    doc_check = db.query(AdminDocument).filter(AdminDocument.id == doc_id).first()
    assert doc_check.category == "Test Catégorie Renommée"
    db.close()

    # 4. DELETE category & check reassignment
    del_res = client.delete(f"/api/documents/categories/{cat_id}")
    assert del_res.status_code == 200
    del_data = del_res.json()
    assert del_data["id"] == cat_id

    # Vérification que la catégorie n'existe plus
    get_after = client.get("/api/documents/categories")
    cats_after = get_after.json()
    assert not any(c["id"] == cat_id for c in cats_after)

    db = SessionLocal()
    doc_after_del = db.query(AdminDocument).filter(AdminDocument.id == doc_id).first()
    assert doc_after_del.category == "Autre"
    db.delete(doc_after_del)
    db.commit()
    db.close()
