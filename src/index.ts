interface Env {
	AES_KV: KVNamespace;
}

function generatePassword(length: number): string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let retVal = "";
	const values = new Uint8Array(length);
	crypto.getRandomValues(values);
	for (let i = 0; i < length; i++) {
		retVal += charset[values[i] % charset.length];
	}
	return retVal;
}

async function encrypt(text: string, password: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(text);

	const pwHash = await crypto.subtle.digest("SHA-256", encoder.encode(password));
	const key = await crypto.subtle.importKey(
		"raw",
		pwHash,
		{ name: "AES-GCM" },
		false,
		["encrypt"]
	);

	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: iv },
		key,
		data
	);

	const combined = new Uint8Array(iv.length + encrypted.byteLength);
	combined.set(iv);
	combined.set(new Uint8Array(encrypted), iv.length);

	return btoa(String.fromCharCode(...combined));
}

async function decrypt(encryptedBase64: string, password: string): Promise<string> {
	const encoder = new TextEncoder();
	const combined = new Uint8Array(
		atob(encryptedBase64)
			.split("")
			.map((c) => c.charCodeAt(0))
	);

	const iv = combined.slice(0, 12);
	const data = combined.slice(12);

	const pwHash = await crypto.subtle.digest("SHA-256", encoder.encode(password));
	const key = await crypto.subtle.importKey(
		"raw",
		pwHash,
		{ name: "AES-GCM" },
		false,
		["decrypt"]
	);

	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: iv },
		key,
		data
	);

	return new TextDecoder().decode(decrypted);
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		if (request.method === "POST" && path === "/save") {
			try {
				const body = await request.json() as { content: string; password?: string };
				const id = crypto.randomUUID();
				let password = body.password;
				let isGenerated = false;

				if (!password || password.trim() === "") {
					password = generatePassword(12);
					isGenerated = true;
				}

				const dataToStore = await encrypt(body.content, password);

				await env.AES_KV.put(id, dataToStore, { expirationTtl: 604800 }); // 7 days

				return new Response(JSON.stringify({ id, password, isGenerated, success: true }), {
					headers: { "Content-Type": "application/json" },
				});
			} catch (e) {
				return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
			}
		}

		if (path.startsWith("/get/")) {
			const id = path.split("/")[2];
			const password = url.searchParams.get("password");
			const encryptedData = await env.AES_KV.get(id);

			if (!encryptedData) {
				return new Response("Not found or expired", { status: 404 });
			}

			try {
				let result = encryptedData;
				if (password) {
					result = await decrypt(encryptedData, password);
				}
				return new Response(result);
			} catch (e) {
				return new Response("Decryption failed. Wrong password?", { status: 403 });
			}
		}

		// Simple UI
		const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AES Secret Store</title>
    <style>
        body { font-family: sans-serif; background: #121212; color: #eee; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .card { background: #1e1e1e; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); width: 100%; max-width: 400px; margin: 1rem; box-sizing: border-box; }
        h1 { color: #00d4ff; font-size: 1.2rem; }
        textarea, input { width: 100%; padding: 0.75rem; margin: 0.5rem 0; background: #2c2c2c; border: 1px solid #444; color: #fff; box-sizing: border-box; font-size: 16px; }
        textarea { min-height: 200px; resize: vertical; }
        button { background: #00d4ff; color: #000; border: none; padding: 0.75rem; width: 100%; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 1rem; }
        .result { margin-top: 1rem; word-break: break-all; font-size: 0.8rem; color: #aaa; }
        a { color: #00d4ff; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .pw-display { background: #333; padding: 0.5rem; margin-bottom: 0.5rem; border-radius: 4px; border: 1px dashed #555; }
    </style>
</head>
<body>
    <div class="card">
        <h1>AES Secret Store</h1>
        <textarea id="content" placeholder="Enter text to save..." rows="10"></textarea>
        <input type="password" id="password" placeholder="Password (Random if empty)">
        <button onclick="save()">Save (Expires in 7 days)</button>
        <div id="res" class="result"></div>
    </div>
    <script>
        async function save() {
            const content = document.getElementById('content').value;
            const passwordInput = document.getElementById('password').value;
            const resDiv = document.getElementById('res');
            
            if (!content) {
                resDiv.innerText = 'Content is empty.';
                return;
            }

            resDiv.innerText = 'Saving...';
            
            try {
                const res = await fetch('/save', {
                    method: 'POST',
                    body: JSON.stringify({ content, password: passwordInput }),
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await res.json();
                if (data.id) {
                    const finalPassword = data.password;
                    const link = window.location.origin + '/get/' + data.id + '?password=' + encodeURIComponent(finalPassword);
                    let html = 'Saved!<br><br>';
                    if (data.isGenerated) {
                        html += '<div class="pw-display">Generated Password: <b style="color:#00d4ff">' + finalPassword + '</b></div>';
                    }
                    html += 'Link: <a href="' + link + '" target="_blank">' + link + '</a>';
                    resDiv.innerHTML = html;
                } else {
                    resDiv.innerText = 'Error saving: ' + (data.error || 'Unknown error');
                }
            } catch (e) {
                resDiv.innerText = 'Error: ' + e.message;
            }
        }
    </script>
</body>
</html>
		`;

		return new Response(html, { headers: { "Content-Type": "text/html" } });
	},
} satisfies ExportedHandler<Env>;
