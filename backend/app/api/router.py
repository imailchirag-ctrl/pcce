from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.career_quest import router as career_quest_router
from app.api.intelligence import router as intelligence_router
from app.api.parallel_universe import router as parallel_universe_router
from app.api.product import router as product_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(product_router)
api_router.include_router(career_quest_router)
api_router.include_router(intelligence_router)
api_router.include_router(parallel_universe_router)
