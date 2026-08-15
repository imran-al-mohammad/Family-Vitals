import os

SUPABASE_URL = os.environ.get(
    "FAMILY_VITALS_SUPABASE_URL",
    "https://ewppvkesxqksauuikghd.supabase.co",
)
SUPABASE_KEY = os.environ.get(
    "FAMILY_VITALS_SUPABASE_KEY",
    "sb_publishable_Fo8SPeH04ZtikKSPEySr3w_hlhSH5z2",
)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}
