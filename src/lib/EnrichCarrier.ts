import axios from 'axios';
import {config} from '../config/env';
import {logger} from '../utils/logger';

export interface CarrierInfo {
    country_code: string | null;
    network_name: string | null;
    network_code: number | null;
}

interface CarrierEntry {
    name: string;
    code: number;
}

const PREFIX_MAP: Record<string, CarrierEntry> = {
    '25470': {name: 'Safaricom', code: 1},
    '25471': {name: 'Safaricom', code: 1},
    '25472': {name: 'Safaricom', code: 1},
    '25473': {name: 'Safaricom', code: 1},
    '25474': {name: 'Safaricom', code: 1},
    '25475': {name: 'Safaricom', code: 1},
    '25476': {name: 'Safaricom', code: 1},
    '25477': {name: 'Telkom', code: 2},
    '25478': {name: 'Airtel', code: 3},
    '25479': {name: 'Safaricom', code: 1},
    '25411': {name: 'Safaricom', code: 1},
};

const DEFAULT_CARRIER: CarrierEntry = {name: 'Unknown', code: 0};

async function lookupApi(phoneNumber: string): Promise<CarrierInfo | null> {
    try {
        const url = `${config.fuelrod_api}/v1/map-network`;
        const response = await axios.post(url, {phone_number: phoneNumber}, {timeout: 5000});
        const data = response.data.data;
        return {
            country_code: data.country_code ?? null,
            network_name: data.network_name ?? null,
            network_code: data.network_code ?? 0,
        };
    } catch (error: any) {
        logger.warn(`API carrier lookup failed for ${phoneNumber}: ${error.message}`);
        return null;
    }
}

export async function enrichCarrierInfo(phoneNumber: string): Promise<CarrierInfo | null> {
    try {
        const cleaned = phoneNumber.replace(/[^\d]/g, '');
        const normalized = cleaned.startsWith('254') ? cleaned : `254${cleaned.replace(/^0/, '')}`;

        const prefix = normalized.slice(0, 5);
        const carrier = PREFIX_MAP[prefix] ?? DEFAULT_CARRIER;

        if (carrier.code !== 0) {
            logger.debug(`Carrier lookup: ${phoneNumber} → ${carrier.name} (${carrier.code})`);
            return {
                country_code: 'KE',
                network_name: carrier.name,
                network_code: carrier.code,
            };
        }

        logger.debug(`Local lookup unknown for ${phoneNumber}, trying API`);
        return await lookupApi(phoneNumber);
    } catch (error: any) {
        logger.warn(`Carrier lookup failed for ${phoneNumber}: ${error.message}`);
        return null;
    }
}
