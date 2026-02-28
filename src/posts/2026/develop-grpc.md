---
title: Изобретая gRPC
author: kafkiansky
date: 2026-02-23
tags:
  - php
  - gRPC
draft: false
prev:
  title: Изобретая protobuf
  url: 2026/develop-protobuf
---

Хотя `gRPC` тесно ассоциирован с `protobuf` как часть одного фреймворка, эта связь не настолько сильная, чтобы на месте `protobuf` нельзя было использовать `msgpack`, упомянутый в прошлой статье `avro` или даже `json`. В отличие от `amqp`, протоколов `cassandra`, `kafka` и некоторых других систем, которые, на самом деле, объединяют в себе протоколы общения и сериализации, `gRPC` как транспорт оборачивает сообщения, сериализованные в любом формате, в собственный бинарный протокол.

При этом и самостоятельным транспортом `gRPC` назвать тоже трудно — он работает на `http/2`, используя в качестве тела запроса всего один бинарный фрейм, куда входят флаг, указывающий, сжато сообщение, например в `gzip`, или нет, размер сообщения и само сообщение. Ни больше ни меньше, `gRPC` — это фреймворк, или, если быть точным, спецификация к фреймворку, позволяющая построить альтернативную классическому `http` экосистему на любом языке программирования. 

Хотя может показаться, что использование `http` протокола не является преимуществом по сравнению с привычным для многих `openapi`, важно понимать, что `http/2`, хоть и считается идейным продолжителем[^1], на самом деле является совсем другим протоколом.

Если не говорить про `http/1`, главный недостаток которого — закрытие соединения после каждого запроса — исправил `http/1.1`, даже он не смог избавиться от всех родовых травм этого протокола. И текстовый формат, если вы подумали про него, — не самая большая из них. В конце концов, есть текстовые протоколы, вроде `nats` и `redis`, по производительности не уступающие бинарным. Серьезной проблемой же является синхронность этого (`http/1.1`) протокола: нельзя отправить два запроса *параллельно*[^2] по одному соединению. Ради масштабирования приходится использовать пул соединений, который значительно дороже и ограниченнее мультиплексирования запросов через стримы, предлагаемых `http/2`. `gRPC` не стал прятать `http/2`, а сделал его стримы — одно из главных преимуществ этого протокола — частью фреймворка, что доступно прямо в схеме определения сервисов. 

Чтобы понять преимущество стримов, надо знать, как работает `http/1.1`. Любой запрос внутри такого соединения блокирует целое соединение, пока на запрос не будет получен ответ. Так происходит из-за отсутствия какой-либо идентификации между запросами, что быстро их запутает, отправь мы следующий запрос, не дожидаясь ответа на предыдущий. Вернее, отправить следующий запрос мы можем, особенно если использовать [http/1.1 pipelining](https://en.wikipedia.org/wiki/HTTP_pipelining), — который, впрочем, не снискал популярности, — однако этот запрос будет обработан сервером только после завершения текущего. Как бы то ни было, мы сталкивались с проблемой [head of line blocking](https://en.wikipedia.org/wiki/Head-of-line_blocking), которую были вынуждены решать открытием нового соединения. 

Решением этой проблемы являются стримы, которые где-то, например в `amqp`, называют каналами, где-то, например в `cassandra`, сессиями, а где-то как-то еще. Идея у них общая: каждый стрим получает некоторый уникальный[^3] идентификатор, который добавляется к каждому запросу внутри этого стрима. Все запросы внутри стрима упорядочены, как если бы это было классическое `http/1` соединение, но между стримами соблюдать порядок нет необходимости, потому что и клиент, и сервер сопоставляют запрос с ответом, используя идентификаторы стрима. Когда эти идентификаторы заканчиваются, то есть их, стримов, количество превысило число 2^31, соединение открывается заново. Хотя это число является большим, только половину, а именно — нечетную, можно использовать для обычных запросов. Вторая, четная, половина нужна для реализации так называемого [server push](https://en.wikipedia.org/wiki/HTTP/2_Server_Push), о котором в этой статье я говорить не буду.

Стрим в `gRPC` может быть использован как для унарных запросов, в случае с которыми стрим закрывается сразу после получения одного ответа от сервера, так и для потоковых запросов — тогда стрим может быть закрыт либо клиентом, либо сервером, либо любым из них в зависимости от типа стрима: клиентского, серверного или двунаправленного. Эти типы искусственно введены `gRPC`, чтобы создать правильные ограничения при реализации определенных задач. По умолчанию же все `http/2` стримы являются двунаправленными.  

Важным дополнением в `http/2` являются трейлеры, которые имеют формат заголовков и отправляются после тела запроса. Поскольку стрим является продолжительным потоком сообщений, возникает необходимость каким-то образом его корректно завершить, передав окончательные статус выполнения и другую дополнительную информацию о состоянии стрима после его завершения. Раз заголовки были уже отправлены, нужен другой способ это сделать, и им являются трейлеры. Именно с помощью них `gRPC` сервер отправляет заголовки `grpc-status` и `grpc-message` по окончании стрима.

Хотя `gRPC` использует `http/2`, это проявляется не во всем. Так, в качестве статус-кода сервер всегда отправляет 200. Исключением является только единственный случай: если клиент в качестве `content-type` присылает что угодно, кроме `application/grpc`, сервер обязан вернуть 415-й код, потому что маловероятно, что специфические для `gRPC` трейлеры клиент, приславший другой `content-type`, поймет. Все данные передаются только в теле запроса, включая различные идентификаторы, которые в обычном случае принято передавать в виде `path` параметров, и поэтому все запросы отправляются методом `POST`. Впрочем, на эти свойства вы все равно повлиять не можете: для вас все выглядит так, будто `gRPC` использует собственный протокол общения. 

Чтобы договориться с сервером о формате сериализации входящих сообщений, клиент может добавить в заголовок `content-type` название формата через знак "`+`". Для `protobuf` заголовком будет `application/grpc+proto`. По умолчанию, как вы понимаете, и так будет `protobuf`, поэтому его передачу можно опустить. Если формат сериализации сервером не поддерживается, в качестве `grpc-status` будет возвращен код 12 (`UNIMPLEMENTED`)[^4]. То же самое будет при вызове несуществующего `rpc`. К слову, полное название `rpc`, которое передается как `path` в `http` протоколе, формируется из названия пакета, сервиса и имени `rpc` внутри этого сервиса. Например, для такой схемы именем будет `/queue.api.v1.QueueService/CreateQueue`:
```proto
syntax = "proto3";

package queue.api.v1;

service QueueService {
  rpc CreateQueue(...) returns (...);
}
```

Если имя пакета не указано, оно просто не используется. 

Поскольку каждое сообщение сериализуется в бинарный формат, в качестве которого обычно используется `protobuf`, оно хорошо поддается сжатию. Однако типичный для такой задачи заголовок `content-encoding` использовать нельзя, потому что он указывает на сериализацию всего тела сообщения, даже если оно отправляется частями, которое можно разжать только после полного его прочтения, в то время как в `gRPC` каждое сообщение сжимается отдельно, о чем [говорит](https://github.com/thesis-php/grpc/blob/0.1.x/src/Internal/Protocol/Frame.php#L29) первый байт фрейма. Поэтому в `gRPC` для передачи алгоритмов сжатия используются заголовки `grpc-encoding`, отправляемый клиентом, и `grpc-accept-encoding`, отправляемый сервером. Несмотря на отправку заголовка `grpc-encoding`, сообщение по-прежнему может быть не сжато — особенно если это попросту увеличит его размер, — о чем свидетельствует упомянутый байт сжатия. 

Хотя обычно клиент заранее знает алгоритмы сжатия, поддерживаемые сервером, поскольку они часто являются частью одного приложения, теоретически можно узнать эти алгоритмы в процессе взаимодействия, исследуя заголовок `grpc-accept-encoding` после первого создания стрима, чтобы все последующие стримы сжимать одним из доступных одновременно клиенту и серверу алгоритмов. Делает ли так кто-то на самом деле, я не знаю. 

Кроме `grpc-status` и `grpc-message` трейлеров, которые в ряде случаев неспособны передать весь контекст ошибок, `gRPC` вводит трейлер `grpc-status-details-bin`, значением которого должно быть сообщение [google.rpc.Status](https://github.com/googleapis/googleapis/blob/master/google/rpc/status.proto), закодированное в `base64` (как и любые заголовки и трейлеры с суффиксом `-bin`). Кажется, это единственный стандартный трейлер или заголовок, явно требующий передачи `protobuf` сообщения.

Поскольку `google.rpc.Status` требует передачи деталей ошибки в виде [google.protobuf.Any](https://github.com/protocolbuffers/protobuf/blob/main/src/google/protobuf/any.proto#L72), нам необходим реестр всех типов, используемых приложением. Хотя часто это будут сообщения из этой [схемы](https://github.com/googleapis/googleapis/blob/master/google/rpc/error_details.proto), использовать свои сообщения об ошибках тоже можно. Как сделать такой реестр и зачем он нужен `google.protobuf.Any`, я напишу в следующей, заключительной, статье. 

В нашей реализации [gRPC](https://github.com/thesis-php/grpc) сервер может вернуть детали ошибки, бросив исключение:

```php
use Amp\Cancellation;
use Auth\Api\V1\AuthenticateRequest;
use Auth\Api\V1\AuthenticateResponse;
use Auth\Api\V1\AuthenticationServiceServer;
use Google\Rpc\Code;
use Google\Rpc\PreconditionFailure;
use Thesis\Grpc\InvokeError;
use Thesis\Grpc\Metadata;

/**
 * @api
 */
final readonly class AuthenticationServer implements AuthenticationServiceServer
{
    #[\Override]
    public function authenticate(AuthenticateRequest $request, Metadata $md, Cancellation $cancellation): AuthenticateResponse
    {
        ...

        throw new InvokeError(Code::FAILED_PRECONDITION, 'Invalid authentication credentials', [
            new PreconditionFailure([
                new PreconditionFailure\Violation('auth', 'credentials', 'invalid credentials'),
            ]),
        ]);
    }
}
```

А клиент — его поймав:
```php
use Amp\Cancellation;
use Auth\Api\V1\AuthenticateRequest;
use Google\Rpc\PreconditionFailure;
use Thesis\Grpc\InvokeError;

try {
   $response = $client->authenticate(new AuthenticateRequest(...));
} catch (InvokeError $e) {
   foreach ($e->details as $detail) {
      if ($detail instanceof PreconditionFailure) {}
   }
}
```

Чтобы клиент смог сообщить серверу, как долго он готов ждать ответ, можно передать заголовок [grpc-timeout](https://github.com/thesis-php/grpc/blob/0.1.x/src/Metadata/Timeout.php), используя как самое маленькое значение, которым будут наносекунды, так и самое большое — часы. Пожалуй, среди полезных пользователю `gRPC` заголовков или трейлеров это был последний.

Чтобы построить `gRPC` экосистему, мы, поскольку и так уже связали свою деятельность с [amphp](https://github.com/amphp), недолго думая, — о чем потом немного пожалели, — взяли за основу для клиента и сервера [amphp/http-client](https://github.com/amphp/http-client) и [amphp/http-server](https://github.com/amphp/http-server) соответственно. Сервер по умолчанию, как оно и должно быть, сам умеет обрабатывать входящие соединения по нужному протоколу, версию которого ему передает клиент, поэтому с его, клиентской, стороны версию понадобится передать явно:
```php
use Amp\Http\Client\Request;

$request = new Request(
  uri: '/queue.api.v1.QueueService/CreateQueue',
  method: 'POST',
  body: ...,
);

$request->setProtocolVersions(['2']);

$response = $this->client->request($request, $cancellation);
```

Хотя благодаря файберам неблокирующий запрос можно отправить без дополнительных ключевых слов, например `yield`, как было раньше, или функций, например `async`, как стало сейчас, в таком варианте он, хоть и не заблокирует поток выполнения, «заблокирует» вызывающий код, пока `gRPC` сервер не пришлет ответ полностью, включая трейлеры, что нас точно не устраивает, раз мы собираемся использовать стримы. Ни в клиентском стриме, если мы планируем продолжительное время отправлять сообщения, мы не можем получить ответ от сервера сразу, ни в серверном, если планируем продолжительное время читать от него сообщения. Что уж говорить о двунаправленном — тут ситуация еще сложнее.

Я бы не хотел сгущать краски, но добавить [цвета](https://journal.stuffwithstuff.com/2015/02/01/what-color-is-your-function/) все равно придется:

```php
use function Amp\async;

$future = async($this->client->request(...), $request, $cancellation);
```

Между прочим, еще совсем недавно даже этот код не [работал](https://github.com/amphp/http-client/pull/380). Клиент ждал, пока весь запрос, включая тело, которым может быть итератор, не отправится серверу, и только потом возвращал ответ. Реализовать стримы с таким подходом было невозможно. Теперь же, несмотря на то, что у нас по-прежнему нет нормального интерфейса для работы со стримами, мы хотя бы можем начинать читать тело ответа, пока отправляем тело запроса.   

Итак, чтобы создать двунаправленный стрим, нужны две очереди: одна превращается в тело запроса, другая — в тело ответа. Для этого можно использовать [amphp/pipeline](https://github.com/amphp/pipeline), который превращает обычные итераторы в конкурентные. А для превращения тела запроса из итератора в стрим, понятный клиенту, использовать [StreamedContent](https://github.com/amphp/http-client/blob/5.x/src/StreamedContent.php):
```php
use Amp\Pipeline;

/** @var Pipeline\Queue<In> $send */
$send = new Pipeline\Queue();

$request = new Request(
    uri: '/queue.api.v1.QueueService/CreateQueue',
    method: 'POST',
    body: StreamedContent::fromStream(
      new ReadableIterableStream($send->iterate()),
    ),
);
```

Осталось отправить *асинхронно* запрос и вернуть пользователю [стрим](https://github.com/thesis-php/grpc/blob/0.1.x/src/Client/Internal/Http2/ConcurrentClientStream.php):
```php
$future = async($this->client->request(...), $request, $cancellation);

return new ConcurrentClientStream($send);
```

Когда пользователь будет отправлять сообщения в очередь, используя `ConcurrentClientStream::send()`, они попадут клиенту, который по мере получения будет [отправлять](https://github.com/amphp/http-client/blob/5.x/src/Connection/Internal/Http2ConnectionProcessor.php#L1037-L1047) их серверу. Правда, сейчас сообщения стрима никак не сериализуются и не сжимаются, поэтому из одной очереди мы можем сделать другую, пропуская элементы через [StreamCodec](https://github.com/thesis-php/grpc/blob/0.1.x/src/Internal/Http2/StreamCodec.php):
```php
$request = new Request(
    ...
    body: StreamedContent::fromStream(
      new ReadableIterableStream($this->codec->encode($send->iterate())),
    ),
);
```

Правда, чтобы читать ответ *параллельно* отправке запроса, нужно дождаться завершения фьючи:
```php
$future = async($this->client->request(...), $request, $cancellation);
```

А она завершится, когда [придут](https://github.com/amphp/http-client/blob/5.x/src/Connection/Internal/Http2ConnectionProcessor.php#L444) первые заголовки от сервера. Тело ответа, в свою очередь, так же, как тело запроса, будет итератором, элементы которого понадобится разжать и декодировать. Поэтому в наш стрим мы можем передать фьючу и [функцию-замыкание](https://github.com/thesis-php/grpc/blob/0.1.x/src/Internal/Http2/StreamCodec.php#L69) для декодирования итератора:
```php
$future = async($this->http->request(...), $request, $cancellation);

return new ConcurrentClientStream(
    responseFuture: $future,
    send: $send,
    decode: fn(Response $response) => $this->codec->decode(
        $response->getBody(),
        $invoke->type,
    ),
);
```

В конечном счете мы получаем двунаправленный стрим на базе конкурентных итераторов, поддающихся по мере своего чтения неявному преобразованию из пользовательских объектов в `gRPC` фреймы в случае запроса и наоборот — в случае ответа.

```php
/**
 * @template In of object
 * @template-covariant Out of object
 * @template-implements \IteratorAggregate<array-key, Out>
 */
final class ConcurrentClientStream implements \IteratorAggregate
{
    private Response $response {
        get => $this->response ??= $this->responseFuture->await();
    }

    /** @var Pipeline\ConcurrentIterator<Out> */
    private Pipeline\ConcurrentIterator $recv {
        get => $this->recv ??= ($this->decode)($this->response);
    }

    /**
     * @param Future<Response> $responseFuture
     * @param Pipeline\Queue<In> $send
     * @param \Closure(Response): Pipeline\ConcurrentIterator<Out> $decode
     */
    public function __construct(
        private readonly Future $responseFuture,
        private readonly Pipeline\Queue $send,
        private readonly \Closure $decode,
    ) {}

    /**
     * @param In $message
     */
    public function send(object $message): void
    {
        try {
            $this->send->push($message);
        } catch (Pipeline\DisposedException $e) {
            throw new ClientStreamIsClosed($e->getMessage(), $e->getCode(), $e);
        }
    }

    /**
     * @return Out
     */
    public function receive(): object
    {
        if (!$this->recv->continue()) {
            // throw exception
        }

        return $this->recv->getValue();
    }

    #[\Override]
    public function getIterator(): \Traversable
    {
        return $this->recv;
    }
}
```

Разумеется, давать пользователю двунаправленный стрим там, где нужен только клиентский или серверный, чтобы он непременно написал код неправильно, мы не стали, но о дизайне кодогенерации для `gRPC` я напишу в заключительной статье. Тем не менее, весь интерфейс построен вокруг двунаправленных стримов, позволяющих выразить любую логику, в том числе унарные запросы:
```php
$stream = $client->createStream(...);
$stream->send(new SomeRequest());
$stream->close();
$response = $stream->receive();
```

Прежде чем перейти к по-настоящему важным элементам `gRPC` фреймворка, можно вспомнить интерцепторы. Казалось бы, что в них особенного — это же просто миддлвары. Однако тогда как миддлвары, к которым мы привыкли, позволяют встраивать логику в обработку одного запроса, интерцепторы, кроме всего прочего, позволяют декорировать стримы и перехватывать все его сообщения. 

Так, чтобы проверить авторизацию на сервере, достаточно интерцептора в духе классических миддлвар:
```php
use Amp\Cancellation;
use Google\Rpc\Code;
use Thesis\Grpc\InvokeError;
use Thesis\Grpc\Metadata;
use Thesis\Grpc\Server;
use Thesis\Grpc\Server\StreamInfo;
use Thesis\Grpc\ServerStream;

final readonly class ServerAuthenticationInterceptor implements Server\Interceptor
{
    #[\Override]
    public function intercept(
        ServerStream $stream,
        StreamInfo $info,
        Metadata $md,
        Cancellation $cancellation,
        callable $next,
    ): void {
        if ($md->value('Authorization') !== 'token') {
            throw new InvokeError(Code::UNAUTHENTICATED);
        }

        $next($stream, $info, $md, $cancellation);
    }
}
```

А чтобы выполнять действие над каждым сообщением, например логирование, необходимо задекорировать стрим:
```php
use Psr\Log\LoggerInterface;
use Thesis\Grpc\Server;
use Thesis\Grpc\ServerStream;

/**
 * @api
 * @template-covariant In of object
 * @template Out of object
 * @template-extends Server\DecoratedStream<In, Out>
 */
final class LoggingServerStream extends Server\DecoratedStream
{
    public function __construct(
        ServerStream $stream,
        private readonly LoggerInterface $logger,
    ) {
        parent::__construct($stream);
    }

    #[\Override]
    public function send(object $message): void
    {
        $this->logger->info('Message of type "{type}" was sent', [
            'type' => $message::class,
        ]);

        parent::send($message);
    }

    #[\Override]
    public function receive(): object
    {
        $message = parent::receive();

        $this->logger->info('Message of "{type}" was received', [
            'type' => $message::class,
        ]);

        return $message;
    }
}
```

И добавить этот стрим в пайплайн:
```php
use Amp\Cancellation;
use Psr\Log\LoggerInterface;
use Thesis\Grpc\Metadata;
use Thesis\Grpc\Server;
use Thesis\Grpc\Server\StreamInfo;
use Thesis\Grpc\ServerStream;

final readonly class LoggingServerInterceptor implements Server\Interceptor
{
    public function __construct(
        private LoggerInterface $logger,
    ) {}

    #[\Override]
    public function intercept(
        ServerStream $stream,
        StreamInfo $info,
        Metadata $md,
        Cancellation $cancellation,
        callable $next,
    ): void {
        $next(new LoggingServerStream($stream, $this->logger), $info, $md, $cancellation);
    }
}
```

Фреймворком `gRPC` делают не столько транспорт и сериализация, тем более последняя, как я уже писал, может быть заменена, сколько экосистема соглашений. Так, в `gRPC` есть [рефлексия](https://github.com/grpc/grpc/blob/master/src/proto/grpc/reflection/v1/reflection.proto), на базе которой можно строить динамические инструменты, вроде [grpcurl](https://github.com/fullstorydev/grpcurl) и [grpcui](https://github.com/fullstorydev/grpcui), не требующие наличия сгенерированного кода, чтобы выступать в роли клиентов, опираясь на схему, сериализованную в виде `protobuf` сообщений. Для этого требуется реализация как со стороны инструментов кодогенерации, то есть плагина к `protoc`, так и со стороны `gRPC` сервера, поддерживающего интроспекцию зарегистрированных сервисов. 

Чтобы реализовать незаметный пользователям и другим сервисам деплой приложения, рестарты и балансировку трафика, в `gRPC` есть [health](https://github.com/grpc/grpc/blob/master/src/proto/grpc/health/v1/health.proto), с помощью которого сервисы оркестрации приложений, например `kubernetes`, могут проверять сервисы на доступность, прежде чем направлять трафик на живые поды, а другие сервисы, например `envoy`, реализовывать балансировку, исключая недоступные сервисы. Хотя в обычном `http` такое тоже принято делать, там можно увидеть разные стандарты: где `/healthz`, где — `/metrics`, а где — правда, уже совсем реже — `/ping`.

Балансировка трафика и обнаружение сервисов есть не только перед приложениями, использующими `gRPC`, но и между ними. Так, для разрешения имен написан [стандарт](https://github.com/grpc/grpc/blob/master/doc/naming.md), который предлагает реализовать поддержку плагинов, используемых для этой задачи, помимо обычного `dns`. Такой же [cтандарт](https://github.com/grpc/grpc/blob/master/doc/load-balancing.md) есть и для реализации балансировки запросов на уровне клиента.

На первый взгляд, это кажется каким-то переусложнением — ведь `http/1.1` справляется и без этих стандартов. Тут оказывается, что природные преимущества `gRPC`, а точнее — `http/2`, в некоторых случаях оборачиваются его *недостатками*[^5]. Поскольку `http/2` использует одно `tcp` соединение, по которому мультиплексирует запросы, стандартные `L4` балансировщики [перестают приносить пользу](https://kubernetes.io/blog/2018/11/07/grpc-load-balancing-on-kubernetes-without-tears/), так как работают на уровне соединений. Для такой задачи нужны балансировщики другого уровня — уровня `L7`, — понимающие протокол передачи данных и его особенности. Для `http/1.1` таким балансировщиком является `nginx`. В `gRPC` нам [дан выбор](https://grpc.io/blog/grpc-load-balancing/): или умный (еще говорят — толстый) клиент, реализующий логику разрешения имен и балансировки трафика, или внешний прокси, например [envoy](https://github.com/envoyproxy/envoy), или `service mesh` в лице [istio](https://github.com/istio/istio) и [linkerd](https://github.com/linkerd/linkerd2). Иногда интеграция с такими системами может быть незаметной, если они выступают в роли [sidecar контейнеров](https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/), а иногда требуют реализации протосхемы, например упомянутой выше `health`, благодаря которой внешняя система будет понимать, какие инстансы приложения доступны.

Простым, а иногда даже самым лучшим, вариантом, о чем также [написано](https://grpc.io/blog/grpc-load-balancing/#recommendations-and-best-practices) в документации, будет реализация балансировки на уровне клиента. Для разрешения имен можно использовать `dns`, для правильной работы которого `gRPC` сервисы в `kubernetes` придется настроить как [headless](https://kubernetes.io/docs/concepts/services-networking/service/#headless-services), чтобы для каждого пода получить выделенный `IP` адрес, а для балансировки реализовать несколько простых алгоритмов из [стандарта](https://github.com/grpc/grpc/blob/master/doc/load-balancing.md), в который входят `peek_first` и `round_robin`. В `php` для неблокирующей работы с `dns` есть [amphp/dns](https://github.com/amphp/dns), который учитывает различные приоритеты по разрешению имен, включая файл `/etc/hosts`, умеет обращаться как по `udp` (стандартный протокол), так и `tcp` (fallback).

Поскольку частая проблема `dns` — это кэширование, можно пойти еще дальше — и использовать специализированные системы для реализации [service discovery](https://en.wikipedia.org/wiki/Service_discovery), вроде [etcd](https://etcd.io/), [consul](https://developer.hashicorp.com/consul) и [zookeeper](https://zookeeper.apache.org/). В этом случае сервер сам регистрирует (или удаляет) свое имя в этом сервисе, обращаясь к которому клиенты всегда будут получать актуальную топологию приложения. 

Чтобы убедиться в зрелости `gRPC` как экосистемы и преимуществах `http/2` как протокола, можно посмотреть на системы, использующие `gRPC`. И если [workflow движком](https://temporal.io/), возможно, никого не удивишь, то фактом, что современные распределенные базы данных, вроде [ydb](https://ydb.tech/) и [etcd](https://etcd.io/), используют `gRPC` не только для коммуникации между своими нодами, как делают некоторые, а еще как клиентский протокол, озадачить можно любого. Также из систем, известных многим, `gRPC` есть в [centrifugo](https://centrifugal.dev/docs/transports/client_protocol), сервере для real-time (веб-сокеты, sse) общения, и системе для сбора трассировок по [opentelemetry](https://opentelemetry.io/docs/specs/otlp/#otlpgrpc) протоколу — [jaeger](https://www.jaegertracing.io/).

Правда, ни возможность пользоваться такими системами полноценно, особенно двунаправленный стриминг, например топики в `ydb`, ни как протокол общения между `php` приложениями, особенно со стороны сервера, со стандартным стеком от [Google](https://grpc.io/docs/languages/php/quickstart/) доступно не было. Отчасти виноваты умирающая модель работы и блокирующая природа языка, отчасти — непопулярность и, хуже того, слабые компетенции по `php` в `Google`.

---

[^1]: под продолжением идей я подразумеваю передачу метода, пути, заголовков и тела сообщения. 

[^2]: тут долго можно спорить, что называть параллелизмом при работе с сетью, потому что в конечном итоге все упирается в строго упорядоченный `tcp`, проблемы которого уже решает [quic](https://en.wikipedia.org/wiki/QUIC), построенный на базе `udp` и лежащий в основе `http/3`. Я же больше подразумеваю параллелизм на стороне приложения, а не протокола общения, строгая упорядоченность которого мешает реализации этого вида параллелизма. Иными словами, приложение, использующее `http/2`, способно только с одним соединением принимать или отправлять несколько запросов одновременно, в то время как `http/1.1` требует открыть другое соединение, если необходимо отправить следующий запрос немедленно. 

[^3]: в некоторых протоколах, например в `amqp`, уникальный он только на то время, пока о нем не забыли клиент с сервером; после этого ранее использованные идентификаторы можно использовать опять.

[^4]: этот и другой коды берутся из [этого енама](https://github.com/googleapis/googleapis/blob/master/google/rpc/code.proto#L32). Если вы обратите внимание, в комментариях к каждому коду описан соответствующий `http` код, от чего может сложиться впечатление, что они всегда отправляются в паре, однако это не так: `http` код отправляется только при загадочном (особенно при использовании прокси) отсутствии заголовка `grpc-status`, и поэтому клиент может использовать классический заголовок в качестве замены.

[^5]: разумеется, я утрирую. Скорее, это сложность внедрения необходимой инфраструктуры и понимания проблемы среди разработчиков в принципе.
