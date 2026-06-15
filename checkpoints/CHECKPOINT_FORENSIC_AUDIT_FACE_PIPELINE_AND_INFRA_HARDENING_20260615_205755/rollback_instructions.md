# Checkpoint Rollback Instructions: CHECKPOINT_FORENSIC_AUDIT_FACE_PIPELINE_AND_INFRA_HARDENING_20260615_205755

To revert the modifications made for the face-ai authentication pipeline, nginx routing, frontend container healthcheck, and backend auth reset endpoints, execute the following commands in the project root directory:

```powershell
# Restore backed up original source files
Copy-Item "checkpoints\CHECKPOINT_FORENSIC_AUDIT_FACE_PIPELINE_AND_INFRA_HARDENING_20260615_205755\backup_main.py" "face-ai-service\src\main.py" -Force
Copy-Item "checkpoints\CHECKPOINT_FORENSIC_AUDIT_FACE_PIPELINE_AND_INFRA_HARDENING_20260615_205755\backup_docker-compose.yml" "docker-compose.yml" -Force
Copy-Item "checkpoints\CHECKPOINT_FORENSIC_AUDIT_FACE_PIPELINE_AND_INFRA_HARDENING_20260615_205755\backup_nginx.conf" "nginx\nginx.conf" -Force
Copy-Item "checkpoints\CHECKPOINT_FORENSIC_AUDIT_FACE_PIPELINE_AND_INFRA_HARDENING_20260615_205755\backup_routes.js" "backend-api\src\modules\auth\routes.js" -Force

# Rebuild and restart the modified Docker containers
docker compose down
docker compose up -d --build
```
