# DB Architecture

Android APK → DB Backend API → Model Adapter → Memory / Knowledge / Tools → Android APK.

Security: model-provider secrets stay on the backend and are never shipped in the APK. DB keeps its own conversation and memory layer so model providers can be replaced later.
