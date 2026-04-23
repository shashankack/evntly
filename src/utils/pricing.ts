export interface ActivityPricingAddOn {
	id: string;
	label: string;
	pricePaise: number;
	seatCount?: number;
	description?: string;
	maxQuantity?: number;
}

export interface ActivityPricingConfig {
	baseLabel?: string;
	baseSeatCount?: number;
	addOns?: ActivityPricingAddOn[];
}

export interface SelectedAddOn {
	id: string;
	quantity: number;
}

export interface FeeLineItem {
	kind: 'base' | 'addon';
	id: string;
	label: string;
	quantity: number;
	unitPricePaise: number;
	seatCount: number;
	lineTotalPaise: number;
}

export interface ComputedRegistrationPricing {
	baseCount: number;
	baseSeatCount: number;
	seatCount: number;
	totalAmountPaise: number;
	baseAmountPaise: number;
	addonAmountPaise: number;
	selectedAddOns: Array<SelectedAddOn & { label: string; unitPricePaise: number; seatCount: number; lineTotalPaise: number }>;
	lineItems: FeeLineItem[];
}

function toInteger(value: unknown, fallback = 0): number {
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export function parsePricingConfig(value: unknown): ActivityPricingConfig {
	if (!value) {
		return {};
	}

	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value);
			return parsePricingConfig(parsed);
		} catch {
			return {};
		}
	}

	if (typeof value !== 'object') {
		return {};
	}

	const rawConfig = value as Record<string, unknown>;
	const nestedConfig = rawConfig.pricingConfig ?? rawConfig.pricing_config;
	const config = nestedConfig && typeof nestedConfig === 'object'
		? (nestedConfig as Record<string, unknown>)
		: rawConfig;
	const rawAddOns = config.addOns ?? config.addons ?? config.add_ons;

	return {
		baseLabel: typeof config.baseLabel === 'string'
			? config.baseLabel
			: typeof config.base_label === 'string'
				? config.base_label
				: undefined,
		baseSeatCount:
			config.baseSeatCount !== undefined
				? Math.max(1, toInteger(config.baseSeatCount, 1))
				: config.base_seat_count !== undefined
					? Math.max(1, toInteger(config.base_seat_count, 1))
					: undefined,
		addOns: Array.isArray(rawAddOns)
			? rawAddOns
				.map((addOn) => {
					if (!addOn || typeof addOn !== 'object') return null;
					const item = addOn as Record<string, unknown>;
					const idSource = item.id ?? item.code ?? item.key;
					const labelSource = item.label ?? item.name ?? item.title;
					const id = typeof idSource === 'string' && idSource.trim() ? idSource.trim() : null;
					const label = typeof labelSource === 'string' && labelSource.trim() ? labelSource.trim() : null;
					const priceSource = item.pricePaise ?? item.price_paise ?? item.price ?? item.amountPaise ?? item.amount_paise;
					const pricePaise = toInteger(priceSource, Number.NaN);
					if (!id || !label || !Number.isFinite(pricePaise) || pricePaise < 0) {
						return null;
					}
					return {
						id,
						label,
						pricePaise,
						seatCount:
							item.seatCount !== undefined
								? Math.max(1, toInteger(item.seatCount, 1))
								: item.seat_count !== undefined
									? Math.max(1, toInteger(item.seat_count, 1))
									: undefined,
						description: typeof item.description === 'string' ? item.description : undefined,
						maxQuantity:
							item.maxQuantity !== undefined
								? Math.max(1, toInteger(item.maxQuantity, 1))
								: item.max_quantity !== undefined
									? Math.max(1, toInteger(item.max_quantity, 1))
									: undefined,
					} satisfies ActivityPricingAddOn;
				})
				.filter((addOn): addOn is ActivityPricingAddOn => Boolean(addOn))
			: undefined,
	};
}

export function computeRegistrationPricing(params: {
	registrationFeePaise: number;
	pricingConfig: ActivityPricingConfig | unknown;
	baseCount: number;
	selectedAddOns?: SelectedAddOn[];
}): ComputedRegistrationPricing {
	const pricingConfig = parsePricingConfig(params.pricingConfig);
	const baseCount = Math.max(1, toInteger(params.baseCount, 1));
	const baseSeatCount = Math.max(1, toInteger(pricingConfig.baseSeatCount ?? 1, 1));
	const registrationFeePaise = Math.max(0, toInteger(params.registrationFeePaise, 0));
	const selections = Array.isArray(params.selectedAddOns) ? params.selectedAddOns : [];
	const addOnDefinitions = pricingConfig.addOns ?? [];
	const addOnLookup = new Map(addOnDefinitions.map((addOn) => [addOn.id, addOn]));

	const baseAmountPaise = registrationFeePaise * baseCount;
	const lineItems: FeeLineItem[] = [
		{
			kind: 'base',
			id: 'base',
			label: pricingConfig.baseLabel || 'Registration',
			quantity: baseCount,
			unitPricePaise: registrationFeePaise,
			seatCount: baseSeatCount * baseCount,
			lineTotalPaise: baseAmountPaise,
		},
	];

	const selectedAddOns = selections.map((selection) => {
		const addonId = typeof selection?.id === 'string' ? selection.id.trim() : '';
		const quantity = Math.max(0, toInteger(selection?.quantity, 0));
		if (!addonId || quantity === 0) {
			return null;
		}

		const definition = addOnLookup.get(addonId);
		if (!definition) {
			throw new Error(`Unknown add-on: ${addonId}`);
		}

		if (definition.maxQuantity && quantity > definition.maxQuantity) {
			throw new Error(`Add-on quantity exceeds allowed maximum for ${definition.label}`);
		}

		const seatCount = Math.max(1, definition.seatCount ?? 1);
		const lineTotalPaise = definition.pricePaise * quantity;

		lineItems.push({
			kind: 'addon',
			id: definition.id,
			label: definition.label,
			quantity,
			unitPricePaise: definition.pricePaise,
			seatCount,
			lineTotalPaise,
		});

		return {
			id: definition.id,
			quantity,
			label: definition.label,
			unitPricePaise: definition.pricePaise,
			seatCount,
			lineTotalPaise,
		};
	}).filter((selection): selection is NonNullable<typeof selection> => Boolean(selection));

	const addonAmountPaise = selectedAddOns.reduce((total, item) => total + item.lineTotalPaise, 0);
	const seatCount = lineItems.reduce((total, item) => total + item.seatCount, 0);
	const totalAmountPaise = baseAmountPaise + addonAmountPaise;

	return {
		baseCount,
		baseSeatCount,
		seatCount,
		totalAmountPaise,
		baseAmountPaise,
		addonAmountPaise,
		selectedAddOns,
		lineItems,
	};
}