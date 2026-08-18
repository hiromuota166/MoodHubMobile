# `GET /search` のエラーフロー

iOSアプリからのリクエストが、どの層を通り、誰がエラーを判定・返却しているかを整理する。

```mermaid
sequenceDiagram
    actor iOS as iOSアプリ
    participant Fastify as Fastify(フレームワーク)
    participant Handler as /searchハンドラ(自分のコード)
    participant Token as Spotify Accounts API<br/>(/api/token)
    participant Search as Spotify Web API<br/>(/v1/search)

    iOS->>Fastify: GET /search?artist=xxx

    Fastify->>Fastify: querystringスキーマ検証<br/>(artistが必須)

    alt artistが無い/不正
        Fastify-->>iOS: 400 Bad Request
        note over Fastify: ハンドラは一度も呼ばれない。<br/>これは完全にFastify自身が返している。
    else artistは妥当
        Fastify->>Handler: ハンドラ実行

        Handler->>Token: POST /api/token<br/>(Basic認証)

        alt Client ID/Secretが不正
            Token-->>Handler: 400/401 + errorオブジェクト
            Handler->>Handler: Value.Parseが失敗<br/>(access_tokenを含まない形)
            Handler-->>Fastify: catch節で reply.code(502)
            Fastify-->>iOS: 502 Bad Gateway
        else 認証成功
            Token-->>Handler: 200 + access_token
        end

        Handler->>Search: GET /v1/search<br/>(Authorization: Bearer token)

        alt Spotifyがエラー(401/429など)
            Search-->>Handler: 4xx/5xx + errorオブジェクト
            Handler->>Handler: Value.Parseが失敗<br/>(想定したtrack一覧の形と違う)
            Handler-->>Fastify: catch節で reply.code(502)
            Fastify-->>iOS: 502 Bad Gateway
            note over Fastify,iOS: Spotify側の元のエラー理由(401 or 429等)は<br/>iOS側からは区別できない。すべて502に丸められる。
        else Spotify成功
            Search-->>Handler: 200 + track一覧
            Handler->>Handler: Value.Parseで検証・整形
            Handler-->>Fastify: return { tracks }
            Fastify->>Fastify: レスポンススキーマ検証<br/>(200: SearchResponse)
            Fastify-->>iOS: 200 + JSON
        end
    end
```

## 誰が何を判定しているか

| ステータス | 判定の主体 | 判定内容 |
|---|---|---|
| `400` | **Fastify自身** | リクエストのクエリパラメータがスキーマ通りか(ハンドラに到達する前) |
| `502` | **自分のハンドラコード** | Spotifyから受け取った値が `Value.Parse` の期待する形と一致するか |
| `200` | **Fastify + 自分のハンドラコード** | ハンドラが返した値が、宣言したレスポンススキーマ通りか(送信前の最終チェック) |

## 現状の既知の穴

- Spotify側の401(認証切れ)、429(レート制限)、トークン取得失敗は、どれも「Value.Parseの失敗」として同じ502に丸められており、iOS側で原因を区別できない。原因ごとに別のステータス/メッセージを返すのは、必要になった時点での改善対象とする。
