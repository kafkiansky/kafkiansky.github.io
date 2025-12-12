---
title: Статический анализ в php
author: kafkiansky
date: 2023-07-06
tags:
  - php
  - stan
draft: false
---

Статический анализ в PHP — тема не сказать чтобы новая, но и недостаточно распространенная, чтобы перестать ее поднимать. Большинство библиотек и фреймворков либо используют статанализ только для нового кода, либо и вовсе пренебрегают им.

Чтобы подчеркнуть важность статанализа, предлагаю посмотреть, а что там в других языках:
- в `Rust` стандартом является анализатор [clippy](https://github.com/rust-lang/rust-clippy), разрабатываемый авторами языка и предлагающий более 600 линтеров
- в `Go` принято использовать [golangci-lint](https://golangci-lint.run), который помогает улучшать производительность и безопасность кода 
- для `C#` и `C++` можно использовать [PVS-Studio](https://pvs-studio.ru/ru/pvs-studio), который, по словам их авторов, насчитывает более 900 линтеров.

Я намеренно привел в качестве примеров статически типизированные компилируемые языки, чтобы показать, что эта тема широко распространена и актуальна для любого языка, и уже тем более должна быть актуальна для PHP, в котором шансы допустить разного рода ошибки внушительно выше.

На сегодняшний день у нас есть выбор между двумя популярными анализаторами: [psalm](https://psalm.dev) и [phpstan](https://phpstan.org/try).
Также вы можете использовать их одновременно, как делают многие. Это не создаст никаких проблем, так как оба пакета используют и обрабатывают одни и те же аннотации одинаково.

### Итераторы
Не знаю, как вы, а я часто использую итераторы. Например, как понять, какого типа выдает значения итерируемый объект?

```php
final readonly class Cluster implements \IteratorAggregate
{
    public function __construct(
        private array $nodes,
    ) {}

    #[\Override]
    public function getIterator(): \Traversable
    {
        yield from $this->nodes;
    }
}

$cluster = new Cluster([]);

foreach ($cluster as $node) {
    // ???
}
```

Без заглядывания в код, пожалуй, никак. А часто вы заглядываете в код или чейнджлоги библиотек после или перед их обновлением? Что, если тип поменялся?
Даже если вы со всей ответственностью подходите к обновлению зависимостей, неразумно тратить свое время на работу компилятором — отдайте это статанализатору.

```php
final readonly class Node
{
    /**
     * @param non-empty-string $host
     */
    public function __construct(
        public string $host,
    ) {}
}

/**
 * @template-implements \IteratorAggregate<mixed, Node>
 */
final readonly class Cluster implements \IteratorAggregate
{
    /**
     * @param non-empty-list<Node> $nodes
     */
    public function __construct(
        private readonly array $nodes,
    ) {}

    #[\Override]
    public function getIterator(): \Traversable
    {
        yield from $this->nodes;
    }
}

$cluster = new Cluster([new Node('127.0.0.1')]);

foreach ($cluster as $node) {
    echo $node->host;
}
```

Теперь, если тип значений у класса `Cluster` поменяется, вы узнаете об этом на этапе `CI`, а не на проде. Откуда у `\IteratorAggregate` появились дженерики? Все благодаря использованию статанализиторами стабов. Например, вот как выглядит [стаб](https://github.com/vimeo/psalm/blob/master/stubs/CoreGenericIterators.phpstub#L9) для этого интерфейса у псалма. А [так](https://github.com/JetBrains/phpstorm-stubs/blob/master/Core/Core_c.php#L41) он выглядит для `phpstorm`, из-за чего и работает автокомплит при вызове методов и свойств у объекта `$node`.

Мы часто в переменных окружения храним небольшие словари, при работе с которыми хотим обрабатывать ситуацию, когда в словаре случайно оказалась пустая строка. Не проблема, напишем такую функцию:

```php
/**
 * @param non-empty-string $line
 * @return \Traversable<mixed, non-empty-string>
 */
function splitString(string $line): \Traversable
{
    foreach(explode(',', $line) as $v) {
        if ($v !== '') {
            yield $v;
        }
    }
}
```

Но поскольку в енвах все хранится в строках, а нужны нам бывают не только они, нам необходимо уметь парсить строки в нужные нам типы. Например, мы можем хранить в енвах идентификаторы шаблонов писем, которые являются позитивными числами.
Напишем функцию, которая будет превращать итератор одного типа в итератор другого типа с помощью другой функции.

```php
/**
 * @template T
 * @template E
 * @param \Traversable<mixed, E> $values
 * @param callable(E): T $map
 * @return \Traversable<mixed, T>
 */
function map(\Traversable $values, callable $map): \Traversable
{
    foreach ($values as $value) {
        yield $map($value);
    }
}
```

Напишем функцию для преобразования строки в число и проверку диапазона (функция намеренно упрощена):

```php
/**
 * @return positive-int
 */
function coerceToPositiveInt(mixed $value): int
{
    if (is_string($value)) {
        $value = (int) $value;
    }

	if (is_int($value) && $value > 0) {
		return $value;
	}

	throw new \InvalidArgumentException();
}
```

Соединим все вместе:

```php
final readonly class Notifier
{
    /**
     * @param iterable<mixed, positive-int> $templates
     */
    public function __construct(
        private array $templates,
    ) {}
}

$notifier = new Notifier(map(
    splitString('1,2'),
    coerceToPositiveInt(...),
));
```

Как видно, статанализатор смог вывести правильный тип после всех преобразований.

### Примитивные типы

Я часто застаю себя за реализацией всякого рода бинарных протоколов, в которых приходится оперировать числами разного размера: `int8`, `int16`, `uint32` и так далее. А поскольку в php есть только `int`, приходится как-то выкручиваться — как всегда, с помощью статического анализа.

Написать функции, которые записывают `int8` и `uint8` в бинарной форме, можно с помощью указания диапазона значений у `int`. Такой формат поддерживают оба статанализатора.

```php
/**
 * @param int<-128, 127> $v
 */
function writeInt8(int $v): string
{
	return \pack('c', $v);
}

/**
 * @param int<0, 255> $v
 */
function writeUint8(int $v): string
{
	return \pack('C', $v);
}
```

Иногда приходится иметь дело с литеральными типами. Это типы с фиксированным набором значений — другими словами, типы-значения. Например, 3 является числом, но не каждое число является тройкой. Мы не можем использовать в данном случае диапазон, как делали с `int8`, потому что значения могут идти не подряд: например, перечислить список http-кодов, при которых мы должны повторять http-запросы.

```php
/**
 * @param non-empty-string $uri
 * @param 301|500|502 $expectCode
 */
function healthcheck(string $uri, int $expectCode): bool
{
    return doRequest($uri) === $expectCode;
}
```

### Необычные возможности

Вообще говоря, статические анализаторы неуникальны в своих возможностях. Например, условные (возвращаемые) типы уже были в `typescript`, когда они появились в `psalm`, а чуть позже и в `phpstan`.

Допустим, мы хотим написать функцию, которая соблюдает следующие требования:
- Принимает замыкание, возвращающее `?T`, и значение по умолчанию — так же типа `?T`
- Если не передали значение по умолчанию, то возвращаемым типом функции будет `?T`
- Если передали значение по умолчанию, то возвращаемым типом функции будет `T`.

```php
/**
 * @template T
 * @param callable(): ?T $value
 * @param ?T $default
 * @return (T is null ? (?T): T)
 */
function tap(callable $value, mixed $default = null): mixed
{
    return $value() ?? $default;
}

final readonly class User
{
    public function __construct(
        public string $name,
    ) {}
}

$user1 = tap(
    fn (): User => new User('kafkiansky'),
    new User('anonymous'),
);

$user2 = tap(
    fn (): User => new User('kafkiansky'),
);

echo $user1->name;
echo $user2?->name;
``` 

Если мы передадим значение по умолчанию, то можем спокойно обращаться к свойствам и методам нашего объекта без null-safe оператора, а если нет — только с ним. Таким образом, мы статически избавились от необходимости делать лишние проверки на `null` в местах со значением по умолчанию.

Бывает, что нет возможности выделить тип в самостоятельный объект, но при этом он используется по всему проекту. Чтобы не ошибиться в очередной раз при описании типа, можно использовать алиасы типов. Взять тот же пример с `int8`, при наборе которого можно ошибиться в диапазоне значений, — хороший кандидат для алиаса.

```php
/**
 * @psalm-type Int8 = int<-128, 127> 
 */
enum Type
{
    case T;

    /**
     * @return Int8
     */
    public function assertInt8(int $v): int
    {
        if ($v >= -128 && $v <= 127) {
            return $v;
        }

        throw new \InvalidArgumentException("The {$v} not valid int8.");
    }
}

/**
 * @psalm-import-type Int8 from Type
 */
final readonly class Buffer
{
    /**
     * @param Int8 $v
     */
    public function writeInt8(int $v): string
    {
        return \pack('c', $v);
    }
}

$buffer = new Buffer();
$buffer->writeInt8(Type::T->assertInt8(1));
```

Мы использовали тип несколько раз, но описали — один.

Что, если мы уверены, что проверили границы типа, но при этом сам тип остался общим? Можно объяснить это с помощью специальной аннотации `[phpstan|psalm]-assert-if-[true|false]`:
```php
final readonly class Node
{
    public function __construct(
        public string $name,
    ) {}

    /**
     * @psalm-assert-if-true non-empty-string $this->name
     */
    public function isNotEmpty(): bool
    {
        return $this->name !== '';
    }
}

/**
 * @param non-empty-string $name
 */
function takesOnlyNonEmptyString(string $name): void
{
    echo $name;
}

$node = new Node('test');

if ($node->isNotEmpty()) {
	takesOnlyNonEmptyString($node->name);
}
```

В данном случае тип поля `$name` остался прежним — `string`, — но благодаря аннотации мы доказали статанализатору, что границы типа были проверены.

### Дженерики

Говорят, если произнести слово «дженерики», вас обязательно спросят, когда они появятся в PHP. А они есть. Причём в том виде, в котором они есть в других языках, — статическом. В компилируемых языках дженериков также не существует в рантайме, так как они стираются компилятором и заменяются на реальные типы. Заменяем компилятор на статанализатор и получаем то же самое — те же возможности и гарантии.

Я не буду показывать пример с коллекциями — `hello, world` из мира дженериков, — а вместо этого давайте попробуем реализовать тип `Option` из `rust`.

`Option` — это супертип для типов `Some<T>` и `None`, который вынуждает вас явно обрабатывать отсутствие значения в отличие от `null`, способному привести к [неприятным последствиям](https://www.infoq.com/presentations/Null-References-The-Billion-Dollar-Mistake-Tony-Hoare/).

```php
/**
 * @template T 
 */
abstract class Option
{
    /**
     * @return T
     */
    abstract public function unwrap(): mixed;
}

/**
 * @template T
 * @template-extends Option<T>
 */
final readonly class Some extends Option
{
    /**
     * @internal 
     * @param T $value
     */
    public function __construct(
        private mixed $value,
    ) {}

    #[\Override]
    public function unwrap(): mixed
    {
        return $this->value;
    }
}

/**
 * @template T
 * @template-extends Option<T>
 */
final readonly class None extends Option
{
    #[\Override]
    public function unwrap(): never
    {
        throw new \RuntimeException('None unwrapped.');
    }
}
```

На данный момент мы имеем простой тип, который пока еще не сильно лучше `nullable` типа, потому что тоже бросает исключение. Добавим сахара:
```php
/**
 * @template T 
 */
abstract class Option
{
    /**
     * @template E
     * @param E $value
     * @return Some<E>
     */
    final public static function some(mixed $value): Some
    {
        return new Some($value);
    }

   /**
     * @template E
     * @return None<E>
     */
    final public static function none(): None
    {
        return new None();
    }

    /**
     * @psalm-assert-if-true T $this->unwrap()
     * @psalm-this-out Some<T>
     */
    final public function isSome(): bool
    {
        return $this instanceof Some;
    }

    /**
     * @psalm-this-out None<T>
     */
    final public function isNone(): bool
    {
        return $this instanceof None;
    }

    /**
     * @psalm-if-this-is Some<T>
     * @return T
     */
    abstract public function unwrap(): mixed;
}
```

Теперь такой код не будет пропущен статанализатором:
```php
/**
 * @return Option<positive-int>
 */
function doRequest(): Option
{
    return Option::some(200);
}

$option = doRequest();
echo $option->unwrap(); // ERROR: IfThisIsMismatch - 139:16 - Class type must be Some<T:Option as mixed> current type Option<int<1, max>>
```

Дело в том, что теперь метод `unwrap` можно вызывать только на типе `Some<T>`, а на данном этапе типом переменной `$option` является тип `Option<positive-int>`, что не соответствует ограничениям аннотации `@psalm-if-this-is Some<T>`. Чтобы вызвать метод `unwrap` без ошибок от статанализитора, вам необходимо проверить, что в `Option` лежит действительно `Some<T>`:
```php
/**
 * @return Option<positive-int>
 */
function doRequest(): Option
{
    return Option::some(200);
}

$option = doRequest();
if ($option->isSome()) {
	echo $option->unwrap() > 200;
}
```

Когда вы вызываете метод `isSome`, тип объекта с `Option<T>` сужается до `Some<T>`, благодаря аннотации `@psalm-this-out Some<T>`.

Также вы не можете вызывать метод `unwrap`, если `isNone()` будет утвердительным:
```php
/**
 * @return Option<positive-int>
 */
function doRequest(): Option
{
    return Option::some(200);
}

$option = doRequest();
if ($option->isNone()) {
	echo $option->unwrap(); // ERROR: NoValue - 140:7 - All possible types for this argument were invalidated - This may be dead code
}
```

Таким образом, вы либо явно проверяете, что значение существует, и используете его, либо явно затыкаете статанализатор.
Оба варианта если и не избавляют от багов полностью (в конце концов, вы можете обмануть статанализатор аннотациями), то по крайней мере заставляют вас подумать о том, что вы делаете. 

Добавим еще немного методов:

```php
/**
 * @template T 
 */
abstract class Option
{
    /**
     * @param callable(T): bool $f
     */
    final public function isSomeAnd(callable $f): bool
    {
        return $this->isSome() ? $f($this->unwrap()) : false; 
    }

    /**
     * @template Te
     * @psalm-param \Closure(T): Te       $onSome
     * @psalm-param (\Closure(): Te)|null $onNone
     * @psalm-return ($onNone is null ? Option<T> : Some<T>)
     */
    abstract public function map(\Closure $onSome, ?\Closure $onNone = null): Option;
}

/**
 * @template T
 * @template-extends Option<T>
 */
final readonly class None extends Option
{
    #[\Override]
    public function map(\Closure $onSome, ?\Closure $onNone = null): Option
    {
        return null !== $onNone ? self::some($onNone()) : self::none();
    }
}

/**
 * @template T
 * @template-extends Option<T>
 */
final readonly class Some extends Option
{
    #[\Override]
    public function map(\Closure $onSome, ?\Closure $onNone = null): Option
    {
        return self::some($onSome($this->value));
    }
}

$option = doRequest();

$another = $option->map(fn (int $code): string => (string) $code);
if ($another->isSome()) {
    echo $another->unwrap(); // OK
}

if ($option->isSomeAnd(fn (int $code): bool => $code > 200)) {
    echo 'Ok'; // OK
}

echo 200 < $option
    ->map(
        fn (int $code): string => (string) $code,
        fn (): int => 500,
    )
    ->unwrap(); // OK
```

Обратите внимание, что на последнем выражении мы можем вызывать `unwrap` сразу же, без проверки на `isSome`. Это доступно благодаря условным возвращаемым типам, а именно аннотации `@psalm-return ($onNone is null ? Option<T> : Some<T>)`,
которая говорит, что, если мы никак не обработали тип `None`, вернется базовый тип `Option<T>`, в обратном случае всегда вернется `Some<T>`. Таким образом мы получили мощный тип на основе дженериков, который можно использовать в качестве безопасной альтернативы `nullable` типам.

### Теперь наш проект защищён от багов?

Нет. Но теперь от валидации мы ушли к парсингу: каждая функция, вызывающая другую функцию, должна будет гарантировать сходимость типов аргументов, что избавляет от необходимости делать это несколько раз и дает больше информации о типах. Другими словами, мы по-прежнему должны проверять, что работаем с позитивным числом, не пустой строкой,
массивом с определенными ключами, итератором конкретного типа, но теперь информация о значениях находится не (или не только) в валидации, но в самих типах. На эту тему советую статью [Parse, don’t validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/), в которой приведено больше аргументов в пользу такого подхода.

Однако статический анализ полезен не только в контексте парсинга типов: его возможности безграничны. Так, манипулируя AST представлением нашего кода, мы можем собирать много полезной информации о нем, используя систему плагинов статанализаторов.
Позже эту информацию можно пустить на организацию разного рода ограничений и проверок, специфичных для вашего проекта или фреймворка. Осознав это, становится понятно, почему статический анализ популярен и для компилируемых языков, в которых, как кажется, компиляторы и так должны от всего защищать.
Вы не будете добавлять в компилятор запрет на инициализацию массивов без ранней аллокации памяти, потому что с точки зрения компилятора это не ошибка, а с точки зрения статанализатора, который руководствуется собирательным опытом сотни разработчиков, — да, поскольку это может привести к деградации производительности программы.
Иначе говоря, компилятор про ошибки, которые невозможно игнорировать, а статический анализатор про ошибки, которые можно подавлять.

Например, вы можете поставить плагин к псалму, запрещающий использование конструкции [empty](https://github.com/marartner/psalm-no-empty) из-за ее интересных [особенностей](https://www.beberlei.de/post/when_to_use_empty_in_php_i_say_never).
Можно ли провернуть такое на уровне интерпретатора? Нет, потому что это груз истории языка, который невозможно снять без того, чтобы не сломать половину проектов. На это просто никто не пойдет.

Или [плагин](https://github.com/boesing/psalm-plugin-stringf) для валидации `sprintf`, `printf` и похожих функций на правильное количество и типы аргументов. И пусть это не кажется вам мелочью, потому что такая конструкция `sprintf('The message is %s')` кинет исключение `ArgumentCountError` прямо в рантайме, с чем я однажды столкнулся, когда нашел код, где в `catch` блоке обрабатывалось исключение с неправильно написанным `sprintf`, что порождало другое исключение, которое уже никто не перехватывал. Например, в `rust` такое валидируется на этапе компиляции. 

Вы можете запрещать или валидировать не только функции, но и целые пласты кода. Например, [плагин](https://github.com/kafkiansky/service-locator-interrupter) для Laravel, запрещающий использование сервис-локаторов в любом их представлении: в виде фасадов, функций, контейнеров.

Или тоже [плагин](https://github.com/kafkiansky/better-laravel) для Laravel, в котором среди прочего есть линтер для валидации наличия конфига по вложенным ключам (дот-нотация), опечатка в которых может привести к багам на проде.

Таким образом, с помощью статанализатора и плагинов вы можете добавить столько проверок вашего кода, что успешное прохождение `CI` будет гарантировать чуть ли не полную работоспособность программы.

По этой причине в PHP не нужны ни [нативные дженерики](https://github.com/PHPGenerics/php-generics-rfc/issues/45), ни больше [нативных типов](https://wiki.php.net/rfc/true-type), потому что все это давно уже есть в статических анализаторах, до возможностей которых интерпретатор придется очень долго дорабатывать.
