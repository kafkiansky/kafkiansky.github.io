up:
	docker compose up -d

down:
	docker compose down --remove-orphans

serve:
	docker compose exec deno deno task serve
