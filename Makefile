up:
	docker compose up -d

down:
	docker compose down --remove-orphans

serve: up
	docker compose exec deno deno task serve
